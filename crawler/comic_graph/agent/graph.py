r"""ReAct 式 Agent 图（LangGraph）。

    START -> agent --(有 tool_calls 且未超步数)--> tools -> agent
              \---------(否则)---------------> finalize -> END

- ``agent``：调用 LLM（带工具），产出 assistant 消息（可能含 tool_calls）。
- ``tools``：执行上一条 assistant 消息里的所有 tool_calls，回填 tool 观测。
- ``finalize``：汇总工具收集到的漫画，裁到目标数量。

``chat_fn`` 可注入，便于无 LLM Key 时用脚本驱动做联调测试。
"""

from __future__ import annotations

import json
from typing import Any

from langgraph.graph import END, START, StateGraph

from ..config import RunConfig
from ..pipeline import write_comics
from ..sources.base import ComicSource
from ..util import log
from .llm import ChatFn, make_chat_fn
from .prompts import SYSTEM_PROMPT, user_task
from .state import AgentState
from .tools import ToolContext, build_tools


def build_agent_graph(cfg: RunConfig, source: ComicSource, chat_fn: ChatFn | None = None, max_steps: int = 30):
    ctx = ToolContext(source, cfg)
    tools = build_tools()
    specs = [t["spec"] for t in tools]
    handlers = {t["spec"]["function"]["name"]: t["handler"] for t in tools}
    chat_fn = chat_fn or make_chat_fn(cfg)

    async def agent_node(state: AgentState) -> dict:
        messages = list(state.get("messages", []))
        steps = int(state.get("steps", 0)) + 1
        ai = await chat_fn(messages, specs)
        return {"messages": [ai], "steps": steps}

    async def tools_node(state: AgentState) -> dict:
        messages = state.get("messages", [])
        last = messages[-1] if messages else {}
        tool_calls = last.get("tool_calls") or []
        observations: list[dict] = []
        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except Exception:  # noqa: BLE001
                args = {}
            handler = handlers.get(name)
            try:
                content = await handler(ctx, args) if handler else json.dumps({"error": f"unknown tool {name}"})
            except Exception as e:  # noqa: BLE001
                content = json.dumps({"error": str(e)}, ensure_ascii=False)
            observations.append(
                {"role": "tool", "tool_call_id": tc.get("id"), "name": name, "content": content}
            )
        return {"messages": observations}

    async def finalize_node(state: AgentState) -> dict:
        comics = list(ctx.collected.values())[: cfg.limit]
        path = write_comics(cfg, comics)
        log(f"[agent] 结束：收集 {len(comics)} 部 -> {path}")
        if ctx.errors:
            log(f"[agent] {len(ctx.errors)} 条跳过/告警（前 5）：")
            for e in ctx.errors[:5]:
                log(f"    - {e}")
        return {"comics": comics, "results": ctx.collected, "done": True}

    def route(state: AgentState) -> str:
        messages = state.get("messages") or []
        last = messages[-1] if messages else {}
        has_calls = bool(last.get("tool_calls"))
        if has_calls and int(state.get("steps", 0)) < max_steps:
            return "tools"
        return "finalize"

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.add_node("finalize", finalize_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route, {"tools": "tools", "finalize": "finalize"})
    graph.add_edge("tools", "agent")
    graph.add_edge("finalize", END)
    return graph.compile(), ctx


async def run_agent(cfg: RunConfig, source: ComicSource, chat_fn: ChatFn | None = None) -> AgentState:
    graph, _ctx = build_agent_graph(cfg, source, chat_fn=chat_fn)
    initial: AgentState = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_task(cfg.limit)},
        ],
        "steps": 0,
        "done": False,
    }
    return await graph.ainvoke(initial)
