"""通用工具：日志、多语言取值、简介清洗。"""

from __future__ import annotations

import re
import sys
from html import unescape


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


def pick_lang(d: dict | None) -> str:
    """从 {lang: value} 字典中按优先级取第一个非空值。"""
    pref = ["zh", "zh-hk", "zh-tw", "en", "ja-ro", "ja", "ko-ro", "ko"]
    if not isinstance(d, dict):
        return ""
    for k in pref:
        v = d.get(k)
        if v:
            return str(v)
    for v in d.values():
        if v:
            return str(v)
    return ""


def pick_zh_title(attr: dict | None) -> str:
    """优先取中文标题：title.zh/zh-hk/zh-tw，其次 altTitles 中的中文。无则空串。"""
    if not isinstance(attr, dict):
        return ""
    t = attr.get("title") or {}
    for k in ("zh", "zh-hk", "zh-tw"):
        v = t.get(k)
        if v:
            return str(v)
    for a in attr.get("altTitles") or []:
        for k in ("zh", "zh-hk", "zh-tw"):
            v = a.get(k)
            if v:
                return str(v)
    return ""


def clean_md(text: str, limit: int = 160) -> str:
    """去除 Markdown/HTML，压缩空白，截断。"""
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text or "")
    t = re.sub(r"<[^>]+>", "", t)
    t = unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > limit:
        t = t[: limit - 1].rstrip() + "…"
    return t
