"""命令行入口。

用法：
    python crawler/comic_graph/run.py                 # 默认约 120 部
    python crawler/comic_graph/run.py --limit 60 --chapters 40
    python crawler/comic_graph/run.py --llm           # 强制启用 LLM（需配 Key）

也可在 crawler/ 目录下：python -m comic_graph [args]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

# 支持直接 `python crawler/comic_graph/run.py` 运行
_HERE = os.path.dirname(os.path.abspath(__file__))
_CRAWLER = os.path.dirname(_HERE)
if _CRAWLER not in sys.path:
    sys.path.insert(0, _CRAWLER)

from comic_graph.config import RunConfig  # noqa: E402
from comic_graph.pipeline import run_pipeline  # noqa: E402
from comic_graph.sources import available_sources, get_source  # noqa: E402
from comic_graph.util import log  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="帧间漫画 LangGraph 在线数据管线")
    ap.add_argument("--limit", type=int, default=50, help="最终入选漫画数量")
    ap.add_argument("--chapters", type=int, default=60, help="每部最多保存多少话")
    ap.add_argument("--all-chapters", action="store_true", help="获取每部的全部章节（分页拉取，忽略 --chapters）")
    ap.add_argument("--per-page", type=int, default=30, help="每个榜单每次请求条数")
    ap.add_argument("--delay", type=float, default=0.35, help="每次请求间隔（秒）")
    ap.add_argument("--concurrency", type=int, default=4, help="章节抓取并发上限")
    ap.add_argument("--cover-size", default=".256", help="封面尺寸后缀：.256/.512/空为原图")
    ap.add_argument("--out", default=os.path.join(_CRAWLER, "output"), help="comics.json 输出目录")
    ap.add_argument("--source", action="append", default=None, help=f"数据源，可重复；可用：{available_sources()}")
    ap.add_argument("--region", default="", help="仅抓取某地区（如：国漫/日漫/韩漫）")
    ap.add_argument("--exclude-from", default="", help="排除该 comics.json 中已收录的 sourceId（增量抓取）")
    ap.add_argument("--llm", action="store_true", help="强制启用 LLM 增强（也可通过配置 Key 自动启用）")
    ap.add_argument("--agent", action="store_true", help="以 ReAct Agent 模式运行（LLM 决策 + 工具调用，需 LLM Key）")
    return ap.parse_args(argv)


async def _amain(args: argparse.Namespace) -> int:
    cfg = RunConfig.from_args(
        limit=args.limit,
        chapters=args.chapters,
        chapters_all=args.all_chapters,
        per_page=args.per_page,
        delay=args.delay,
        concurrency=args.concurrency,
        cover_size=args.cover_size,
        out=args.out,
        sources=args.source or ["mangadex"],
        region=args.region,
        exclude_from=args.exclude_from,
        use_llm=args.llm,
    )

    from comic_graph.llm import is_configured

    log(f"[run] 数据源 {cfg.sources}，LLM {'已配置' if is_configured() else '未配置'}，目标 {cfg.limit} 部")
    source = get_source(cfg.sources[0], delay=max(0.1, cfg.delay))

    # 模式选择：--agent 或已配置 LLM -> Agent；否则确定性管线（零 Key 可跑）
    use_agent = args.agent or cfg.effective_llm
    if use_agent and not is_configured():
        log("[run] Agent 需要 LLM Key，但未检测到；回退到确定性管线")
        use_agent = False

    if use_agent:
        from comic_graph.agent import run_agent

        log("[run] 模式：Agent（LLM 决策 + 工具调用）")
        result = await run_agent(cfg, source)
    else:
        log("[run] 模式：确定性管线")
        result = await run_pipeline(cfg, source)

    errors = result.get("errors", [])
    if errors:
        log(f"[run] 完成，但有 {len(errors)} 条告警：")
        for e in errors[:20]:
            log(f"    - {e}")
    if not result.get("comics"):
        log("[run] 未产出任何漫画，请检查网络/数据源。")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        return asyncio.run(_amain(args))
    except KeyboardInterrupt:
        log("[run] 已取消")
        return 130


if __name__ == "__main__":
    sys.exit(main())
