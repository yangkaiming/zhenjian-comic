"""Agent 共享状态（ReAct 式工具调用循环）。

- ``messages``：OpenAI 对话格式，逐节点追加（AI 消息 / 工具结果）。
- ``results`` / ``comics``：工具执行过程中收集到的中间与最终数据。
- ``steps``：已进行的 LLM 决策步数，用于兜底防止无限循环。
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from ..config import RunConfig


class AgentState(TypedDict, total=False):
    messages: Annotated[list[dict[str, Any]], operator.add]
    config: RunConfig
    # 工具收集到的归一化漫画（manga_id -> comic）
    results: dict[str, dict[str, Any]]
    # 最终入选漫画列表
    comics: list[dict[str, Any]]
    # 运行告警（跨节点累加）
    errors: Annotated[list[str], operator.add]
    # LLM 决策步数
    steps: int
    # 是否结束
    done: bool
