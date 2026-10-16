"""Agent 工具集：把数据源能力封装成 LLM 可调用的函数。

每个工具 = OpenAI function 规格(spec) + async 处理器(handler)。
处理器返回 JSON 字符串作为工具的观测结果（observation）。
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from ..config import RunConfig
from ..normalize import normalize_manga
from ..sources.base import ComicSource, RawManga


class ToolContext:
    """工具执行上下文：持有数据源、配置与收集结果。"""

    def __init__(self, source: ComicSource, cfg: RunConfig) -> None:
        self.source = source
        self.cfg = cfg
        self.seen: dict[str, RawManga] = {}          # search 见过的完整漫画
        self.collected: dict[str, dict[str, Any]] = {}  # 已归一化收录
        self.errors: list[str] = []
        self._stats_cache: dict[str, dict[str, Any]] = {}

    async def stats(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        missing = [i for i in ids if i not in self._stats_cache]
        if missing:
            got = await self.source.stats(missing)
            self._stats_cache.update(got)
        return {i: self._stats_cache.get(i, {}) for i in ids}


def _spec(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


async def h_search(ctx: ToolContext, args: dict) -> str:
    query = (args.get("query") or "").strip()
    limit = int(args.get("limit") or 12)
    plan: dict[str, Any] = {"label": "agent-search", "order": {"followedCount": "desc"}, "limit": limit}
    if query:
        plan["title"] = query
    items = await ctx.source.search(plan)
    out = []
    for m in items[:limit]:
        ctx.seen[m.id] = m
        out.append({"id": m.id, "title": m.title, "author": m.author, "tags": m.tags[:6]})
    return json.dumps({"query": query, "results": out}, ensure_ascii=False)


async def h_chapters(ctx: ToolContext, args: dict) -> str:
    mid = str(args.get("manga_id") or "")
    limit = int(args.get("limit") or ctx.cfg.chapters)
    if not mid:
        return json.dumps({"error": "manga_id required"}, ensure_ascii=False)
    chs = await ctx.source.chapters(mid, limit)
    out = [{"id": c.id, "title": c.title, "pages": c.pages} for c in chs]
    return json.dumps(
        {"manga_id": mid, "total": len(out), "chapters": out[:20]}, ensure_ascii=False
    )


async def h_collect(ctx: ToolContext, args: dict) -> str:
    mid = str(args.get("manga_id") or "")
    if not mid:
        return json.dumps({"error": "manga_id required"}, ensure_ascii=False)
    if mid in ctx.collected:
        return json.dumps({"ok": True, "note": "already", "title": ctx.collected[mid]["title"]}, ensure_ascii=False)
    raw = ctx.seen.get(mid)
    if raw is None:
        return json.dumps({"error": "unknown manga_id; call search_manga first"}, ensure_ascii=False)
    langs = None if raw.original_language in ('zh', 'zh-hk') else ['zh', 'zh-hk']
    chs = await ctx.source.chapters(mid, ctx.cfg.chapters, fetch_all=ctx.cfg.chapters_all, langs=langs)
    if not chs:
        ctx.errors.append(f"《{raw.title}》无中文章节，跳过")
        return json.dumps({"ok": False, "reason": "no chapters", "title": raw.title}, ensure_ascii=False)
    st = (await ctx.stats([mid])).get(mid, {})
    comic = normalize_manga(raw, chs, st, ctx.source.cover_url, ctx.cfg.cover_size)
    ctx.collected[mid] = comic
    return json.dumps(
        {"ok": True, "title": comic["title"], "chapters": len(chs), "collected": len(ctx.collected)},
        ensure_ascii=False,
    )


async def h_status(ctx: ToolContext, _args: dict) -> str:
    return json.dumps(
        {"collected": len(ctx.collected), "target": ctx.cfg.limit,
         "titles": [c["title"] for c in ctx.collected.values()]},
        ensure_ascii=False,
    )


def build_tools() -> list[dict]:
    """返回 [{spec, handler}, ...]。"""
    return [
        {
            "spec": _spec(
                "search_manga", "按关键词或榜单搜索候选中文漫画，返回 id/标题/作者/标签。",
                {"query": {"type": "string", "description": "可选关键词"},
                 "limit": {"type": "integer", "description": "返回条数，默认 12"}},
                [],
            ),
            "handler": h_search,
        },
        {
            "spec": _spec(
                "get_chapters", "查看某漫画的中文章节列表（id/标题/页数）。",
                {"manga_id": {"type": "string"}, "limit": {"type": "integer"}},
                ["manga_id"],
            ),
            "handler": h_chapters,
        },
        {
            "spec": _spec(
                "collect_comic", "把某漫画正式收录（自动拉章节/统计并归一化）。需先 search_manga。",
                {"manga_id": {"type": "string"}},
                ["manga_id"],
            ),
            "handler": h_collect,
        },
        {
            "spec": _spec("status", "查看当前已收集数量与标题列表。", {}, []),
            "handler": h_status,
        },
    ]
