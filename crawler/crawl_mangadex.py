#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
帧间漫画 —— MangaDex 数据爬虫
=============================

数据源：MangaDex 公共 API（https://api.mangadex.org，无需 Key）
它同时提供：
  - 漫画元数据（标题 / 作者 / 标签 / 简介 / 评分 / 状态）
  - 真实封面图（uploads.mangadex.org，直接给 URL）
  - 章节列表与每章页图（at-home 服务，由服务端按需取 URL）

本脚本**只记录 URL，不下载任何图片**，封面和页图都由前端直接从网上加载。

输出：crawler/output/comics.json
  [{ title, author, description, region, status, categories, tags,
     rating, views, chapterCount, cover, banner, chapters: [{id, title, pages}] }]

仅使用 Python 标准库，无需 pip install。

用法：
  python crawler/crawl_mangadex.py                 # 默认约 120 部
  python crawler/crawl_mangadex.py --limit 60
  python crawler/crawl_mangadex.py --chapters 40   # 每部最多存多少话
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape

API = "https://api.mangadex.org"
UPLOADS = "https://uploads.mangadex.org"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhenjianComicCrawler/1.0"

DEFAULT_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crawler", "output")

# MangaDex 英文标签 -> 应用内分类
TAG_MAP = {
    "Action": "热血",
    "Adventure": "冒险",
    "Comedy": "搞笑",
    "Drama": "剧情",
    "Fantasy": "奇幻",
    "Horror": "悬疑",
    "Mystery": "推理",
    "Romance": "恋爱",
    "Sci-Fi": "科幻",
    "Sports": "运动",
    "Supernatural": "奇幻",
    "Isekai": "奇幻",
    "Slice of Life": "治愈",
    "Psychological": "悬疑",
    "Mecha": "科幻",
    "Mahou Shoujo": "奇幻",
    "Magical Girls": "奇幻",
    "Cooking": "治愈",
    "Music": "日常",
    "Medical": "都市",
    "Office Workers": "都市",
    "School Life": "校园",
    "Delinquents": "校园",
    "Historical": "古风",
    "Military": "战斗",
    "Martial Arts": "热血",
    "Samurai": "古风",
    "Ninja": "热血",
    "Video Games": "竞技",
    "Virtual Reality": "科幻",
    "Post-Apocalyptic": "科幻",
    "Survival": "悬疑",
    "Time Travel": "科幻",
    "Reincarnation": "奇幻",
    "Ghosts": "悬疑",
    "Vampires": "奇幻",
    "Demons": "奇幻",
    "Monsters": "奇幻",
    "Animals": "治愈",
    "Crossdressing": "搞笑",
    "Gyaru": "恋爱",
}

REGION_MAP = {"zh": "国漫", "zh-hk": "国漫", "ja": "日漫", "ko": "韩漫"}

LANG_PREF = ["zh", "zh-hk", "zh-tw", "en", "ja-ro", "ja", "ko-ro", "ko"]


def log(msg: str) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        pass
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
        sys.stdout.flush()


def get(path: str, params: dict | None = None, retries: int = 5) -> dict:
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 429:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 4 * (attempt + 1)
                log(f"    [429] 限流，{wait:.0f}s 后重试…")
                time.sleep(wait)
                continue
            if e.code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:300]
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(f"HTTP {e.code}: {detail}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"请求失败: {last}")


def pick_lang(d: dict | None) -> str:
    if not isinstance(d, dict):
        return ""
    for k in LANG_PREF:
        v = d.get(k)
        if v:
            return str(v)
    for v in d.values():
        if v:
            return str(v)
    return ""


def clean_md(text: str) -> str:
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text or "")
    t = re.sub(r"<[^>]+>", "", t)
    t = unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > 160:
        t = t[:157].rstrip() + "…"
    return t


def fetch_tags() -> dict:
    """标签名 -> 标签 ID"""
    data = get("/manga/tag")
    out: dict[str, str] = {}
    for t in data.get("data", []):
        name = (t.get("attributes") or {}).get("name") or {}
        en = name.get("en")
        if en:
            out[en] = t["id"]
    return out


def cover_url(manga_id: str, file_name: str, size: str = ".512") -> str:
    """MangaDex 封面：尺寸后缀拼在完整文件名之后，例如 a.png.512.jpg"""
    if not file_name:
        return ""
    if size:
        return f"{UPLOADS}/covers/{manga_id}/{file_name}{size}.jpg"
    return f"{UPLOADS}/covers/{manga_id}/{file_name}"


def fetch_feed(manga_id: str, limit: int) -> list:
    data = get(
        f"/manga/{manga_id}/feed",
        {
            "limit": limit,
            "translatedLanguage[]": ["zh", "zh-hk"],
            "order[chapter]": "asc",
            "contentRating[]": ["safe", "suggestive"],
        },
    )
    out = []
    for ch in data.get("data", []):
        attr = ch.get("attributes") or {}
        num = attr.get("chapter")
        title = (attr.get("title") or "").strip()
        if num and title and title != num:
            label = f"第{num}话 {title}"
        elif num:
            label = f"第{num}话"
        else:
            label = title or "全一话"
        out.append({"id": ch["id"], "title": label, "pages": int(attr.get("pages") or 0)})
    return out


def fetch_stats(ids: list) -> dict:
    """逐本获取评分/关注数（MangaDex 只支持单本查询）"""
    out: dict = {}
    for i, mid in enumerate(ids):
        try:
            data = get(f"/statistics/manga/{mid}")
            st = (data.get("statistics") or {})[mid]
            if st:
                out[mid] = st
        except Exception as e:  # noqa: BLE001
            log(f"    [warn] 统计失败 {mid}: {e}")
        if (i + 1) % 20 == 0:
            log(f"    统计进度 {i + 1}/{len(ids)}")
        time.sleep(0.2)
    return out


def build_plans(tags: dict) -> list:
    # skip_lang：中文原版漫画无需按 translatedLanguage 过滤
    plans = [
        {"label": "人气榜", "order": {"followedCount": "desc"}},
        {"label": "评分榜", "order": {"rating": "desc"}},
        {"label": "最新更新", "order": {"latestUploadedChapter": "desc"}},
        {"label": "国漫", "originalLanguage": ["zh"], "order": {"followedCount": "desc"}},
        {"label": "日漫", "originalLanguage": ["ja"], "order": {"followedCount": "desc"}},
        {"label": "韩漫", "originalLanguage": ["ko"], "order": {"followedCount": "desc"}},
    ]
    for name in ["Action", "Romance", "Fantasy", "Mystery", "Comedy", "Sci-Fi", "Slice of Life", "Historical"]:
        if name in tags:
            plans.append({"label": TAG_MAP.get(name, name), "includedTags": [tags[name]], "order": {"followedCount": "desc"}})
    return plans


def main() -> int:
    ap = argparse.ArgumentParser(description="帧间漫画 MangaDex 爬虫")
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--chapters", type=int, default=60, help="每部最多保存多少话")
    ap.add_argument("--per-page", type=int, default=30)
    ap.add_argument("--delay", type=float, default=0.35, help="每次请求间隔（秒）")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--cover-size", default=".512", help="封面尺寸后缀：.256/.512/空为原图")
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out)

    log("[crawler] 获取标签表…")
    tags = fetch_tags()
    log(f"[crawler] 标签 {len(tags)} 个")

    plans = build_plans(tags)
    groups: dict[str, list] = {}

    for plan in plans:
        params: dict = {
            "limit": args.per_page,
            "includes[]": ["cover_art", "author"],
            "contentRating[]": ["safe", "suggestive"],
            "hasAvailableChapters": "true",
        }
        params["availableTranslatedLanguage[]"] = ["zh"]
        for k, v in plan.get("order", {}).items():
            params[f"order[{k}]"] = v
        if "originalLanguage" in plan:
            params["originalLanguage[]"] = plan["originalLanguage"]
        if "includedTags" in plan:
            params["includedTags[]"] = plan["includedTags"]

        log(f"[crawler] 抓取「{plan['label']}」…")
        batch = []
        offset = 0
        for _ in range(2):
            params["offset"] = offset
            try:
                data = get("/manga", params)
            except Exception as e:  # noqa: BLE001
                log(f"    [warn] {e}")
                break
            items = [m for m in data.get("data", []) if m and m.get("id")]
            if not items:
                break
            batch.extend(items)
            offset += args.per_page
            if len(items) < args.per_page:
                break
            time.sleep(args.delay)
        groups[plan["label"]] = batch
        log(f"    +{len(batch)} 条")

    # 选取策略：每轮优先从「贡献最少」的分组取，保证小分组（如国漫）也能被取满
    order = ["国漫", "韩漫", "日漫", "热血", "恋爱", "奇幻", "推理", "搞笑", "科幻", "治愈", "古风", "人气榜", "评分榜", "最新更新"]
    order = [l for l in order if l in groups]
    rank = {l: i for i, l in enumerate(order)}
    ptr = {l: 0 for l in order}
    selected: list = []
    seen: set[str] = set()
    while len(selected) < args.limit:
        # 按 (已取数量, 分组优先级) 排序，取最“缺”的那个分组
        cands = [l for l in order if ptr[l] < len(groups[l])]
        if not cands:
            break
        cands.sort(key=lambda l: (ptr[l], rank[l]))
        label = cands[0]
        m = groups[label][ptr[label]]
        ptr[label] += 1
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        selected.append(m)

    log(f"[crawler] 入选 {len(selected)} 部，开始抓章节…")

    log("[crawler] 获取评分/关注统计…")
    stats = fetch_stats([m["id"] for m in selected])

    comics: list[dict] = []
    seen_titles: set[str] = set()

    for i, m in enumerate(selected, 1):
        mid = m["id"]
        attr = m.get("attributes") or {}

        title = pick_lang(attr.get("title"))
        if not title or title in seen_titles:
            continue
        seen_titles.add(title)

        rels = m.get("relationships") or []
        cover_file = ""
        author = "佚名"
        for r in rels:
            if r.get("type") == "cover_art":
                cover_file = ((r.get("attributes") or {}).get("fileName")) or ""
            elif r.get("type") == "author":
                author = ((r.get("attributes") or {}).get("name")) or "佚名"

        cats: list[str] = []
        for t in attr.get("tags") or []:
            en = ((t.get("attributes") or {}).get("name") or {}).get("en")
            cn = TAG_MAP.get(en or "")
            if cn and cn not in cats:
                cats.append(cn)
        if not cats:
            cats = ["热血"]

        try:
            chapters = fetch_feed(mid, args.chapters)
        except Exception as e:  # noqa: BLE001
            log(f"    [warn] 《{title}》章节获取失败: {e}")
            chapters = []
        if not chapters:
            continue

        rating_raw = (stats.get(mid) or {}).get("rating") or {}
        score = rating_raw.get("bayesian") or rating_raw.get("average")
        follows = (stats.get(mid) or {}).get("follows") or 0

        comics.append(
            {
                "sourceId": mid,
                "title": title,
                "author": author,
                "description": clean_md(pick_lang(attr.get("description"))),
                "region": REGION_MAP.get(attr.get("originalLanguage") or "ja", "日漫"),
                "status": "完结" if attr.get("status") == "completed" else "连载",
                "categories": cats[:3],
                "tags": cats[:3],
                "rating": round(float(score), 1) if score else 8,
                "views": int(follows or 0) * 37,
                "chapterCount": len(chapters),
                "latestChapter": chapters[-1]["title"],
                # 只存 URL，不下载；封面用小图，横幅用大图
                "cover": cover_url(mid, cover_file, ".256"),
                "banner": cover_url(mid, cover_file, ".512"),
                "chapters": chapters,
            }
        )
        if i % 10 == 0 or i == len(selected):
            log(f"    进度 {i}/{len(selected)}")
        time.sleep(args.delay)

    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, "comics.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(comics, f, ensure_ascii=False, indent=2)

    stat: dict[str, int] = {}
    ch_total = 0
    for c in comics:
        stat[c["region"]] = stat.get(c["region"], 0) + 1
        ch_total += len(c["chapters"])
    log(f"[crawler] 已写出 {json_path}")
    log(f"[crawler] {len(comics)} 部 / {ch_total} 话，地区分布 {json.dumps(stat, ensure_ascii=False)}")
    log("[crawler] 完成（未下载任何图片，封面与页图均走网络）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
