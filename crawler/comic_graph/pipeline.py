r"""LangGraph 管线：发现 -> 选取 -> 统计 -> 丰富 -> (可选 LLM) -> 落盘。

图结构：
    START -> discover -> select -> fetch_stats -> enrich
    enrich --(配置了 LLM?)--> llm_enrich -> persist
                              \--> persist -> END
"""

from __future__ import annotations

import asyncio
import json
import math
import os
from typing import Any

from langgraph.graph import END, START, StateGraph

from .config import RunConfig
from .llm import enrich_comics
from .normalize import normalize_manga
from .sources.base import ComicSource, RawManga
from .state import PipelineState
from .util import log

# 均衡选取时的分组优先级（保证国漫/韩漫等小分组也能被取满）
_GROUP_PRIORITY = [
    "国漫", "韩漫", "日漫", "热血", "恋爱", "奇幻", "推理", "搞笑",
    "科幻", "治愈", "古风", "人气榜", "评分榜", "最新更新",
]


def _load_exclude_ids(path: str) -> set[str]:
    """读取已收录 comics.json 的 sourceId 集合，用于增量抓取时去重跳过。"""
    if not path:
        return set()
    try:
        data = json.load(open(path, encoding="utf-8"))
        if isinstance(data, list):
            return {str(c.get("sourceId")) for c in data if isinstance(c, dict) and c.get("sourceId")}
    except Exception:  # noqa: BLE001
        pass
    return set()


def write_comics(cfg: RunConfig, comics: list[dict[str, Any]]) -> str:
    """裁到目标数量并写出 comics.json（管线与 agent 共用）。"""
    comics = comics[: cfg.limit]
    out_dir = os.path.abspath(cfg.out)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "comics.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(comics, f, ensure_ascii=False, indent=2)
    stat: dict[str, int] = {}
    ch_total = 0
    for c in comics:
        stat[c.get("region", "?")] = stat.get(c.get("region", "?"), 0) + 1
        ch_total += len(c.get("chapters", []))
    log(f"[persist] 已写出 {path}")
    log(f"[persist] {len(comics)} 部 / {ch_total} 话，地区分布 {json.dumps(stat, ensure_ascii=False)}")
    return path


def build_graph(cfg: RunConfig, source: ComicSource):
    """构建并编译 LangGraph。节点用闭包捕获 cfg/source，不污染状态。"""

    async def discover(state: PipelineState) -> dict:
        plans = await source.plans()  # type: ignore[attr-defined]
        if cfg.region:
            plans = [p for p in plans if p.get("label") == cfg.region]
            log(f"[discover] 地区过滤：仅「{cfg.region}」，榜单 {len(plans)} 个")
        exclude = _load_exclude_ids(cfg.exclude_from)
        if exclude:
            log(f"[discover] 排除已收录 {len(exclude)} 部")
        candidates: dict[str, dict[str, Any]] = {}
        errs: list[str] = []
        for plan in plans:
            offset = 0
            try:
                for _ in range(2):  # 每个榜单最多翻 2 页
                    p = dict(plan)
                    p["limit"] = cfg.per_page
                    p["offset"] = offset
                    batch = await source.search(p)
                    if not batch:
                        break
                    for m in batch:
                        if m.id and m.id not in candidates and m.id not in exclude:
                            d = m.__dict__.copy()
                            d["_group"] = plan.get("label", "")
                            candidates[m.id] = d
                    offset += cfg.per_page
                    if len(batch) < cfg.per_page:
                        break
                    await asyncio.sleep(cfg.delay)
            except Exception as e:  # noqa: BLE001
                errs.append(f"榜单「{plan.get('label')}」失败: {e}")
        log(f"[discover] 候选 {len(candidates)} 部，来自 {len(plans)} 个榜单")
        return {"candidates": candidates, "errors": errs}

    def select(state: PipelineState) -> dict:
        candidates = state.get("candidates", {})
        groups: dict[str, list[str]] = {}
        for mid, rec in candidates.items():
            groups.setdefault(rec.get("_group", ""), []).append(mid)

        order = [l for l in _GROUP_PRIORITY if l in groups]
        order += [l for l in groups if l not in order]
        rank = {l: i for i, l in enumerate(order)}
        ptr = {l: 0 for l in order}

        # 多选一定比例作为缓冲：enrich 阶段会丢弃无中文章节/取章失败的漫画，
        # 兜底后仍能凑满目标数量。
        target = math.ceil(cfg.limit * 1.3)

        selected: list[str] = []
        seen: set[str] = set()
        while len(selected) < target:
            avail = [l for l in order if ptr[l] < len(groups[l])]
            if not avail:
                break
            avail.sort(key=lambda l: (ptr[l], rank[l]))
            label = avail[0]
            mid = groups[label][ptr[label]]
            ptr[label] += 1
            if mid in seen:
                continue
            seen.add(mid)
            selected.append(mid)
        log(f"[select] 入选 {len(selected)} 部")
        return {"selected": selected}

    async def fetch_stats(state: PipelineState) -> dict:
        selected = state.get("selected", [])
        stats = await source.stats(selected) if selected else {}
        log(f"[fetch_stats] 统计 {len(stats)}/{len(selected)}")
        return {"stats": stats}

    async def enrich(state: PipelineState) -> dict:
        candidates = state.get("candidates", {})
        selected = state.get("selected", [])
        stats = state.get("stats", {})
        sem = asyncio.Semaphore(max(1, cfg.concurrency))
        errs: list[str] = []

        async def work(mid: str) -> dict[str, Any] | None:
            rec = candidates.get(mid)
            if not rec:
                return None
            raw = RawManga(**{k: v for k, v in rec.items() if k != "_group"})
            async with sem:
                try:
                    # 国漫（原语言中文）章节常为各语言翻译版，按中文过滤会为空，故不过滤语言取全部
                    langs = None if raw.original_language in ('zh', 'zh-hk') else ['zh', 'zh-hk']
                    chapters = await source.chapters(mid, cfg.chapters, fetch_all=cfg.chapters_all, langs=langs)
                except Exception as e:  # noqa: BLE001
                    errs.append(f"《{raw.title}》章节失败: {e}")
                    return None
            if not chapters:
                return None
            return normalize_manga(raw, chapters, stats.get(mid), source.cover_url, cfg.cover_size)

        results = await asyncio.gather(*[work(m) for m in selected])
        comics: list[dict[str, Any]] = []
        seen_titles: set[str] = set()
        for c in results:
            if not c or not c.get("title") or c["title"] in seen_titles:
                continue
            seen_titles.add(c["title"])
            comics.append(c)
        log(f"[enrich] 归一化 {len(comics)} 部")
        return {"comics": comics, "errors": errs}

    async def llm_enrich(state: PipelineState) -> dict:
        comics = state.get("comics", [])
        enriched = await enrich_comics(comics, cfg.concurrency)
        return {"comics": enriched, "used_llm": True}

    async def persist(state: PipelineState) -> dict:
        write_comics(cfg, state.get("comics", []))
        return {}

    def route(_state: PipelineState) -> str:
        return "llm" if cfg.effective_llm else "persist"

    graph = StateGraph(PipelineState)
    graph.add_node("discover", discover)
    graph.add_node("select", select)
    graph.add_node("fetch_stats", fetch_stats)
    graph.add_node("enrich", enrich)
    graph.add_node("llm_enrich", llm_enrich)
    graph.add_node("persist", persist)

    graph.add_edge(START, "discover")
    graph.add_edge("discover", "select")
    graph.add_edge("select", "fetch_stats")
    graph.add_edge("fetch_stats", "enrich")
    graph.add_conditional_edges("enrich", route, {"llm": "llm_enrich", "persist": "persist"})
    graph.add_edge("llm_enrich", "persist")
    graph.add_edge("persist", END)

    return graph.compile()


async def run_pipeline(cfg: RunConfig, source: ComicSource) -> PipelineState:
    graph = build_graph(cfg, source)
    initial: PipelineState = {
        "config": cfg,
        "candidates": {},
        "selected": [],
        "stats": {},
        "comics": [],
        "errors": [],
        "used_llm": False,
    }
    return await graph.ainvoke(initial)
