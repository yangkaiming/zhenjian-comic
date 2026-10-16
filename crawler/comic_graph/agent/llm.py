"""Agent 的 LLM 客户端：OpenAI 兼容的 Chat Completions + 工具调用。

复用顶层 ``llm.py`` 的配置解析；通过依赖注入（chat_fn）便于无 Key 测试。
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

import httpx

from ..llm import _settings, is_configured

ChatFn = Callable[[list[dict], list[dict]], Awaitable[dict]]


async def openai_chat(messages: list[dict], tools: list[dict], temperature: float = 0.2) -> dict:
    """调用一次带工具的对话，返回规范化后的 assistant 消息 dict。"""
    if not is_configured():
        raise RuntimeError("LLM 未配置：请设置 OPENAI_API_KEY / COMIC_LLM_API_KEY")
    key, base, model = _settings()
    payload: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    async with httpx.AsyncClient(timeout=120) as cli:
        resp = await cli.post(
            f"{base}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {key}"},
        )
        resp.raise_for_status()
        data = resp.json()
    msg = data["choices"][0]["message"]
    out: dict[str, Any] = {"role": "assistant", "content": msg.get("content") or ""}
    if msg.get("tool_calls"):
        out["tool_calls"] = msg["tool_calls"]
    return out


def make_chat_fn(cfg) -> ChatFn:
    async def fn(messages: list[dict], tools: list[dict]) -> dict:
        return await openai_chat(messages, tools)

    return fn
