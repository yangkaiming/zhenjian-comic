"""数据源抽象层：统一「搜索/章节/统计/封面」接口，便于扩展多源。"""

from __future__ import annotations

from .base import ComicSource, RawChapter, RawManga
from .mangadex import MangaDexSource

# 源名 -> 源实例工厂
_REGISTRY: dict[str, type] = {
    MangaDexSource.name: MangaDexSource,
}


def available_sources() -> list[str]:
    return list(_REGISTRY.keys())


def get_source(name: str, **kwargs: object) -> ComicSource:
    if name not in _REGISTRY:
        raise ValueError(f"未知数据源: {name}；可用: {available_sources()}")
    return _REGISTRY[name](**kwargs)  # type: ignore[call-arg]


def register_source(cls: type) -> None:
    """注册新的数据源（扩展多源用）。"""
    _REGISTRY[cls.name] = cls


__all__ = [
    "ComicSource",
    "RawChapter",
    "RawManga",
    "available_sources",
    "get_source",
    "register_source",
    "MangaDexSource",
]
