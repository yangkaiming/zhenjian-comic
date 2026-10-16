"""可选 LLM 增强（lazy，零 Key 时完全不加载相关依赖）。

通过 OpenAI 兼容的 Chat Completions 接口，对简介做「中文化 + 清洗 + 截断」，
并可微调标签归并。任何失败都安全回退到确定性结果，不中断管线。

环境变量：
  OPENAI_API_KEY / COMIC_LLM_API_KEY   —— 任一存在即视为已配置
  OPENAI_BASE_URL / COMIC_LLM_BASE_URL —— 默认 https://api.openai.com/v1
  COMIC_LLM_MODEL                      —— 默认 gpt-4o-mini
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx

from .util import log

_SYS = (
    "你是漫画资料编辑。请把给定的漫画简介整理成一句自然、通顺的中文简介"
    "（不超过 60 字，不要换行，不要书名号堆叠），并可从给定标签里挑最能代表"
    "作品的 1-3 个中文标签。严格只输出 JSON："
    '{"description": "...", "tags": ["..."]}'
)


def is_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("COMIC_LLM_API_KEY"))


def _settings() -> tuple[str, str, str]:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("COMIC_LLM_API_KEY") or ""
    base = (os.getenv("OPENAI_BASE_URL") or os.getenv("COMIC_LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("COMIC_LLM_MODEL") or "gpt-4o-mini"
    return key, base, model


def _extract_json(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


async def _enrich_one(client: httpx.AsyncClient, comic: dict[str, Any], sem: asyncio.Semaphore) -> dict[str, Any] | None:
    key, base, model = _settings()
    user = (
        f"标题：{comic.get('title', '')}\n"
        f"标签：{'、'.join(comic.get('tags') or [])}\n"
        f"原简介：{comic.get('description', '')}"
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYS},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    async with sem:
        try:
            resp = await client.post(
                f"{base}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {key}"},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return _extract_json(content)
        except Exception as e:  # noqa: BLE001
            log(f"    [llm] 《{comic.get('title')}》增强失败，保留原值: {e}")
            return None


async def enrich_comics(comics: list[dict[str, Any]], concurrency: int = 4) -> list[dict[str, Any]]:
    """对 comics 做 LLM 增强；未配置或失败则原样返回。"""
    if not is_configured() or not comics:
        return comics
    key, base, model = _settings()
    log(f"[llm] 启用大模型增强：model={model} base={base}")
    sem = asyncio.Semaphore(max(1, concurrency))
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_enrich_one(client, c, sem) for c in comics]
        )
    changed = 0
    for comic, res in zip(comics, results):
        if not res:
            continue
        desc = (res.get("description") or "").strip()
        if desc:
            comic["description"] = desc[:120]
        tags = res.get("tags")
        if isinstance(tags, list):
            cleaned = [str(t).strip() for t in tags if str(t).strip()][:3]
            if cleaned:
                comic["tags"] = cleaned
                comic["categories"] = cleaned
        changed += 1
    log(f"[llm] 已增强 {changed}/{len(comics)} 部")
    return comics
