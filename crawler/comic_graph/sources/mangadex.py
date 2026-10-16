"""MangaDex 数据源实现（async + httpx + 重试 + 全局限流）。

只取 URL 与元数据，不下载任何图片；封面/页图由前端直接从网上加载。
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from ..util import pick_lang, pick_zh_title
from .base import RawChapter, RawManga

API = "https://api.mangadex.org"
UPLOADS = "https://uploads.mangadex.org"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhenjianComicLangGraph/1.0"


class _Throttle:
    """全局最小请求间隔，兼容并发（MangaDex 约 5 req/s）。"""

    def __init__(self, min_interval: float) -> None:
        self.min_interval = min_interval
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self.min_interval - (now - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()


class MangaDexSource:
    name = "mangadex"

    def __init__(self, delay: float = 0.2, timeout: float = 45.0, retries: int = 5) -> None:
        self._delay = delay
        self._timeout = timeout
        self._retries = retries
        self._throttle = _Throttle(delay)

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict | None = None) -> dict:
        last: Exception | None = None
        for attempt in range(self._retries):
            await self._throttle.wait()
            try:
                resp = await client.get(API + path, params=params or {})
                if resp.status_code == 429:
                    ra = resp.headers.get("Retry-After")
                    wait = float(ra) if ra and ra.isdigit() else 4 * (attempt + 1)
                    log_wait = f"[mangadex] 429 限流，{wait:.0f}s 后重试…"
                    print(log_wait, flush=True)
                    await asyncio.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    await asyncio.sleep(2 * (attempt + 1))
                    last = RuntimeError(f"HTTP {resp.status_code}")
                    continue
                resp.raise_for_status()
                return resp.json()
            except (httpx.TimeoutException, httpx.TransportError) as e:  # type: ignore[union-attr]
                last = e
                await asyncio.sleep(2 * (attempt + 1))
        raise RuntimeError(f"请求失败 {path}: {last}")

    async def tag_ids(self) -> dict[str, str]:
        """英文标签名 -> 标签 ID（用于按标签建榜单）。"""
        out: dict[str, str] = {}
        async with httpx.AsyncClient(headers={"User-Agent": UA}, timeout=self._timeout) as client:
            data = await self._get(client, "/manga/tag")
            for t in data.get("data", []):
                en = ((t.get("attributes") or {}).get("name") or {}).get("en")
                if en:
                    out[en] = t["id"]
        return out

    async def plans(self) -> list[dict[str, Any]]:
        """MangaDex 榜单计划：人气/评分/更新 + 分区 + 标签。"""
        tags = await self.tag_ids()
        from ..normalize import TAG_MAP

        plans: list[dict[str, Any]] = [
            {"label": "人气榜", "order": {"followedCount": "desc"}},
            {"label": "评分榜", "order": {"rating": "desc"}},
            {"label": "最新更新", "order": {"latestUploadedChapter": "desc"}},
            {"label": "国漫", "originalLanguage": ["zh"], "skip_lang": True, "order": {"followedCount": "desc"}},
            {"label": "日漫", "originalLanguage": ["ja"], "order": {"followedCount": "desc"}},
            {"label": "韩漫", "originalLanguage": ["ko"], "order": {"followedCount": "desc"}},
        ]
        for name in ["Action", "Romance", "Fantasy", "Mystery", "Comedy", "Sci-Fi", "Slice of Life", "Historical"]:
            if name in tags:
                plans.append({"label": TAG_MAP.get(name, name), "includedTags": [tags[name]], "order": {"followedCount": "desc"}})
        return plans

    async def search(self, plan: dict[str, Any]) -> list[RawManga]:
        params: dict[str, Any] = {
            "limit": plan.get("limit", 30),
            "includes[]": ["cover_art", "author"],
            "contentRating[]": ["safe", "suggestive"],
            "hasAvailableChapters": "true",
        }
        # 中文原版漫画章节是原文而非“翻译”，MangaDex 不把 zh 计入可翻译语言，
        # 若按 availableTranslatedLanguage=zh 过滤会几乎为空，故原语言计划跳过该过滤。
        if not plan.get("skip_lang"):
            params["availableTranslatedLanguage[]"] = ["zh"]
        for k, v in plan.get("order", {}).items():
            params[f"order[{k}]"] = v
        if "originalLanguage" in plan:
            params["originalLanguage[]"] = plan["originalLanguage"]
        if "includedTags" in plan:
            params["includedTags[]"] = plan["includedTags"]
        if plan.get("title"):
            params["title"] = plan["title"]
        if plan.get("offset"):
            params["offset"] = plan["offset"]

        out: list[RawManga] = []
        async with httpx.AsyncClient(headers={"User-Agent": UA}, timeout=self._timeout) as client:
            data = await self._get(client, "/manga", params)
            for m in data.get("data", []):
                if not m or not m.get("id"):
                    continue
                attr = m.get("attributes") or {}
                rels = m.get("relationships") or []
                cover_file = ""
                author = "佚名"
                for r in rels:
                    if r.get("type") == "cover_art":
                        cover_file = ((r.get("attributes") or {}).get("fileName")) or ""
                    elif r.get("type") == "author":
                        author = ((r.get("attributes") or {}).get("name")) or "佚名"
                tags: list[str] = []
                for t in attr.get("tags") or []:
                    en = ((t.get("attributes") or {}).get("name") or {}).get("en")
                    if en:
                        tags.append(en)
                out.append(
                    RawManga(
                        id=m["id"],
                        title=pick_zh_title(attr) or pick_lang(attr.get("title")),
                        author=author,
                        description=pick_lang(attr.get("description")),
                        original_language=attr.get("originalLanguage") or "ja",
                        status=attr.get("status") or "ongoing",
                        tags=tags,
                        cover_file=cover_file,
                        group=plan.get("label", ""),
                    )
                )
        return out

    async def chapters(self, manga_id: str, limit: int, fetch_all: bool = False, langs: list[str] | None = ['zh', 'zh-hk']) -> list[RawChapter]:
        page = 500 if fetch_all else max(1, min(limit, 500))
        params: dict[str, Any] = {
            "order[chapter]": "asc",
            "contentRating[]": ["safe", "suggestive"],
        }
        # langs=None 表示不过滤语言（用于国漫：其章节常为各语言翻译版，按中文过滤会为空）
        if langs:
            params["translatedLanguage[]"] = langs
        out: list[RawChapter] = []
        offset = 0
        seen: set[str] = set()  # 按话数去重，避免同一话的多语言重复版
        async with httpx.AsyncClient(headers={"User-Agent": UA}, timeout=self._timeout) as client:
            while True:
                try:
                    data = await self._get(client, f"/manga/{manga_id}/feed", {**params, "limit": page, "offset": offset})
                except Exception as e:  # noqa: BLE001
                    # 触达接口 offset 上限等：保留已取到的章节并停止翻页，避免整部被抓取失败丢弃
                    print(f"[mangadex] {manga_id} 章节分页中止于 offset={offset}: {e}", flush=True)
                    break
                items = data.get("data", [])
                for ch in items:
                    attr = ch.get("attributes") or {}
                    num = attr.get("chapter")
                    # 去重键：有话数按话数，否则按章节 ID（全一话）
                    key = str(num) if num else f"id:{ch['id']}"
                    if key in seen:
                        continue
                    seen.add(key)
                    title = (attr.get("title") or "").strip()
                    if num and title and title != num:
                        label = f"第{num}话 {title}"
                    elif num:
                        label = f"第{num}话"
                    else:
                        label = title or "全一话"
                    out.append(RawChapter(id=ch["id"], title=label, pages=int(attr.get("pages") or 0)))
                # 非全量：取一页即可；全量：不满一页或达到安全上限即停
                if not fetch_all or len(items) < page or offset >= 5000:
                    break
                offset += page
                await asyncio.sleep(self._delay)
        return out

    async def stats(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        if not ids:
            return out
        async with httpx.AsyncClient(headers={"User-Agent": UA}, timeout=self._timeout) as client:
            # 批量：一次最多约 100 个，大幅减少请求数
            for i in range(0, len(ids), 100):
                batch = ids[i : i + 100]
                try:
                    data = await self._get(client, "/statistics/manga", [("manga[]", m) for m in batch])
                    for mid, v in (data.get("statistics") or {}).items():
                        out[mid] = v
                except Exception as e:  # noqa: BLE001
                    print(f"[mangadex] 批量统计失败，回退逐个: {e}", flush=True)
                    for mid in batch:
                        try:
                            d = await self._get(client, f"/statistics/manga/{mid}")
                            v = (d.get("statistics") or {}).get(mid)
                            if v:
                                out[mid] = v
                        except Exception as e2:  # noqa: BLE001
                            print(f"[mangadex] 统计失败 {mid}: {e2}", flush=True)
        return out

    def cover_url(self, manga_id: str, file_name: str, size: str = ".256") -> str:
        if not file_name:
            return ""
        if size:
            return f"{UPLOADS}/covers/{manga_id}/{file_name}{size}.jpg"
        return f"{UPLOADS}/covers/{manga_id}/{file_name}"
