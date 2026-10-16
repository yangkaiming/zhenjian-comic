"""数据源协议与原始数据结构。

管线只依赖这里的抽象；新增站点只需实现 ``ComicSource`` 并
``register_source`` 注册，无需改动管线节点。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class RawChapter:
    id: str                 # 站点章节 ID（Node 端存为 sourceId）
    title: str
    pages: int = 0


@dataclass
class RawManga:
    id: str                 # 站点漫画 ID
    title: str
    author: str = "佚名"
    description: str = ""
    original_language: str = "ja"
    status: str = "ongoing"
    tags: list[str] = field(default_factory=list)   # 站点原始标签名
    cover_file: str = ""                            # 站点封面文件名
    group: str = ""                                 # 来源榜单标签（选取用）


@runtime_checkable
class ComicSource(Protocol):
    """在线漫画数据源协议（async）。"""

    name: str

    async def search(self, plan: dict[str, Any]) -> list[RawManga]:
        """按榜单/检索计划返回候选漫画。"""
        ...

    async def chapters(self, manga_id: str, limit: int, fetch_all: bool = False, langs: list[str] | None = ['zh', 'zh-hk']) -> list[RawChapter]:
        """返回某漫画的章节列表（按正序）。

        fetch_all=True 时分页取全部；langs 为翻译语言过滤（默认中文），
        传 None 表示不过滤语言（国漫原始章节多为各语言翻译版，按中文过滤会为空）。
        """
        ...

    async def stats(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        """返回评分/关注等统计：id -> {...}。"""
        ...

    def cover_url(self, manga_id: str, file_name: str, size: str = ".256") -> str:
        """拼接封面 URL。"""
        ...
