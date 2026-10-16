"""LangGraph 共享状态定义。

StateGraph 的各节点只返回需要更新的字段（部分更新），
因此这里全部字段都用 ``total=False``。
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from .config import RunConfig


class PipelineState(TypedDict, total=False):
    config: RunConfig
    # 发现阶段：source_id -> 原始漫画记录（含 _group 榜单标签）
    candidates: dict[str, dict[str, Any]]
    # 选出阶段：去重 + 均衡选取后的有序 source_id
    selected: list[str]
    # 评分/关注统计：source_id -> {rating:{...}, follows:int}
    stats: dict[str, dict[str, Any]]
    # 归一化后的漫画（应用 comics.json 契约）
    comics: list[dict[str, Any]]
    # 运行期间的告警/错误（跨节点累加，不中断，供 report 展示）
    errors: Annotated[list[str], operator.add]
    # 是否实际走了 LLM 增强分支
    used_llm: bool
