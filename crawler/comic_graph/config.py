"""运行配置：合并命令行参数与环境变量，带合理默认值。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class RunConfig:
    # 抓取规模
    limit: int = 50             # 最终入选漫画数量
    chapters: int = 60          # 每部最多保存多少话（chapters_all=True 时忽略）
    chapters_all: bool = False  # 是否获取每部的全部章节（分页拉取）
    per_page: int = 30          # 每个榜单每次请求条数
    delay: float = 0.35         # 每次请求间隔（秒），用于限流
    concurrency: int = 4        # 章节抓取并发上限
    cover_size: str = ".256"    # 封面尺寸后缀：.256/.512/空为原图

    # 输出
    out: str = "crawler/output"  # comics.json 输出目录

    # 数据源（可扩展多源，默认 MangaDex）
    sources: list[str] = field(default_factory=lambda: ["mangadex"])

    # 地区过滤（如“国漫”）：只保留该地区的漫画
    region: str = ''
    # 排除已收录：读取该 comics.json 里的 sourceId，抓取时跳过（用于增量补充）
    exclude_from: str = ''

    # LLM（可选）：显式 --llm 开启，或配置了 Key 后自动开启
    use_llm: bool = False

    @property
    def llm_configured(self) -> bool:
        return bool(
            os.getenv("OPENAI_API_KEY")
            or os.getenv("COMIC_LLM_API_KEY")
            or os.getenv("DASHSCOPE_API_KEY")
        )

    @property
    def effective_llm(self) -> bool:
        """实际是否启用 LLM：显式开启 或 配置了 Key。"""
        return self.use_llm or self.llm_configured

    @staticmethod
    def from_args(**kwargs: object) -> "RunConfig":
        cfg = RunConfig()
        for k, v in kwargs.items():
            if v is not None and hasattr(cfg, k):
                setattr(cfg, k, v)
        return cfg
