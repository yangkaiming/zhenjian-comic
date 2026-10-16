"""把数据源的原始记录归一化成 Node 端约定的 comics.json 契约。"""

from __future__ import annotations

from typing import Any, Callable

from .sources.base import RawChapter, RawManga
from .util import clean_md, pick_lang

# MangaDex 英文标签 -> 应用内分类
TAG_MAP: dict[str, str] = {
    "Action": "热血", "Adventure": "冒险", "Comedy": "搞笑", "Drama": "剧情",
    "Fantasy": "奇幻", "Horror": "悬疑", "Mystery": "推理", "Romance": "恋爱",
    "Sci-Fi": "科幻", "Sports": "运动", "Supernatural": "奇幻", "Isekai": "奇幻",
    "Slice of Life": "治愈", "Psychological": "悬疑", "Mecha": "科幻",
    "Mahou Shoujo": "奇幻", "Magical Girls": "奇幻", "Cooking": "治愈",
    "Music": "日常", "Medical": "都市", "Office Workers": "都市",
    "School Life": "校园", "Delinquents": "校园", "Historical": "古风",
    "Military": "战斗", "Martial Arts": "热血", "Samurai": "古风", "Ninja": "热血",
    "Video Games": "竞技", "Virtual Reality": "科幻", "Post-Apocalyptic": "科幻",
    "Survival": "悬疑", "Time Travel": "科幻", "Reincarnation": "奇幻",
    "Ghosts": "悬疑", "Vampires": "奇幻", "Demons": "奇幻", "Monsters": "奇幻",
    "Animals": "治愈", "Crossdressing": "搞笑", "Gyaru": "恋爱",
}

REGION_MAP: dict[str, str] = {"zh": "国漫", "zh-hk": "国漫", "ja": "日漫", "ko": "韩漫"}


def map_categories(tags: list[str], cap: int = 3) -> list[str]:
    cats: list[str] = []
    for en in tags:
        cn = TAG_MAP.get(en)
        if cn and cn not in cats:
            cats.append(cn)
    if not cats:
        cats = ["热血"]
    return cats[:cap]


def normalize_manga(
    raw: RawManga,
    chapters: list[RawChapter],
    stats: dict[str, Any] | None,
    cover_url: Callable[[str, str, str], str],
    cover_size: str = ".256",
) -> dict[str, Any]:
    stats = stats or {}
    rating_raw = stats.get("rating") or {}
    score = rating_raw.get("bayesian") or rating_raw.get("average")
    follows = int(stats.get("follows") or 0)
    cats = map_categories(raw.tags)

    ch_list = [
        {"id": c.id, "title": c.title, "pages": c.pages}
        for c in chapters
    ]

    return {
        "sourceId": raw.id,
        "title": raw.title,
        "author": raw.author or "佚名",
        "description": clean_md(raw.description) or "暂无简介",
        "region": REGION_MAP.get(raw.original_language or "ja", "日漫"),
        "status": "完结" if raw.status == "completed" else "连载",
        "categories": cats,
        "tags": cats,
        "rating": round(float(score), 1) if score else 8,
        "views": follows * 37 if follows else 1000,
        "chapterCount": len(ch_list),
        "latestChapter": ch_list[-1]["title"] if ch_list else "",
        # 只存 URL，不下载；封面用小图，横幅用大图
        "cover": cover_url(raw.id, raw.cover_file, cover_size),
        "banner": cover_url(raw.id, raw.cover_file, ".512"),
        "chapters": ch_list,
    }
