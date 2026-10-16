# 帧间漫画 · LangGraph 在线数据管线

针对 Electron 桌面端「帧间漫画」，用 **LangGraph** 从在线漫画数据源抓取
漫画元数据与章节，归一化成 Node 服务端约定的 `comics.json` 契约，
让应用里的**漫画与章节直接使用可用的网上数据**（封面/页图均只存 URL，由前端直连加载）。

- 默认 **纯确定性**：只调 MangaDex 公共 API，零 Key 即可跑。
- **可选 LLM**：配置了 API Key 后，自动用大模型清洗/中文化简介、归并标签（无需额外依赖）。
- **可扩展多源**：统一 `ComicSource` 接口，先实现 MangaDex，新增站点只需实现接口并注册。
- **零侵入集成**：产物写 `crawler/output/comics.json`，Node 的 `seed.ts` / `crawled.ts` 无需任何改动。

## 目录结构

```
crawler/comic_graph/
├─ run.py / __main__.py  # CLI：python crawler/comic_graph/run.py 或 python -m comic_graph
├─ config.py             # 运行配置（参数 + 环境变量 + LLM/Agent 开关）
├─ state.py              # 管线共享状态 TypedDict
├─ pipeline.py           # 确定性管线（StateGraph，零 Key 可跑）+ write_comics
├─ normalize.py          # 归一化成 comics.json 契约（tag/region/简介）
├─ llm.py                # LLM 配置解析（lazy import，零 Key 不加载）
├─ util.py               # 日志 / 多语言取值 / 简介清洗
├─ agent/                # ★ ReAct Agent（LLM 决策 + 工具调用）
│  ├─ state.py           #   AgentState（messages/steps/results/comics…）
│  ├─ tools.py           #   工具：search_manga / get_chapters / collect_comic / status
│  ├─ prompts.py         #   系统提示词
│  ├─ llm.py             #   OpenAI 兼容 Chat+Tools 客户端（chat_fn 可注入）
│  └─ graph.py           #   agent ↔ tools 循环 + finalize
├─ sources/
│  ├─ base.py        # ComicSource 协议 + RawManga/RawChapter
│  └─ mangadex.py    # MangaDex 实现（async + 重试 + 限流 + 榜单/标题搜索）
└─ requirements.txt
```

两种形态：
- **确定性管线**（默认，零 Key）：固定 ETL 步骤，稳定可重放。
- **ReAct Agent**（配了 LLM Key 或 `--agent`）：由大模型决策调用工具收集漫画，
  `agent/` 即标准 agent 结构（`state.py` / `tools.py` / `prompts.py` / `graph.py`）。

## 图结构

```
START → discover → select → fetch_stats → enrich
                          enrich ─(配置了 LLM?)─→ llm_enrich ┐
                                   └──────────────→ persist ←┘ → END
```

| 节点 | 作用 |
| --- | --- |
| `discover` | 按榜单计划（人气/评分/更新 + 国漫/日漫/韩漫 + 标签）拉候选 |
| `select` | 去重 + 均衡选取到 `--limit`（优先照顾小分组） |
| `fetch_stats` | 拉评分/关注数 |
| `enrich` | 并发拉章节、归一化成应用 schema |
| `llm_enrich` | （可选）大模型清洗简介/标签 |
| `persist` | 写 `crawler/output/comics.json` |

## Agent 模式（ReAct）

```
START → agent ─(有 tool_calls 且未超步数)─→ tools → agent
              └──────────(否则)─────────→ finalize → END
```

| 节点 | 作用 |
| --- | --- |
| `agent` | 调用 LLM（带 tools），产出 assistant 消息（可含 tool_calls） |
| `tools` | 执行上一条消息里的所有 tool_calls，回填观测（observation） |
| `finalize` | 汇总工具收集到的漫画并写出 |

工具：`search_manga` / `get_chapters` / `collect_comic` / `status`（见 `agent/tools.py`）。

运行（需 LLM Key，OpenAI 兼容接口，模型需支持 tool calling）：

```bash
set OPENAI_API_KEY=sk-xxxx
set COMIC_LLM_MODEL=gpt-4o-mini
python crawler/comic_graph/run.py --agent --limit 50
```

`chat_fn` 可注入（见 `agent/llm.py` / `agent/graph.py`），未配 Key 时也能用脚本驱动联调。

## 使用

```bash
# 1) 安装依赖（仅 langgraph + httpx）
pip install -r crawler/comic_graph/requirements.txt

# 2) 抓数据并生成 comics.json
python crawler/comic_graph/run.py                 # 默认 50 部
python crawler/comic_graph/run.py --limit 60 --chapters 40

# 3) 重新灌库（Node 端 seed 仅在库为空时自动跑；强制重灌用 --force）
npm run seed -- --force
```

或直接用 npm 脚本：

```bash
npm run crawl:graph          # 等价于 python crawler/comic_graph/run.py
npm run crawl:graph:seed     # 抓取 + 强制重灌数据库
```

## 启用 LLM 增强（可选）

设置任一 Key 即自动启用；也可加 `--llm` 强制开启：

```bash
# OpenAI 兼容接口
set OPENAI_API_KEY=sk-xxxx            # Windows (PowerShell: $env:)
set OPENAI_BASE_URL=https://api.openai.com/v1
set COMIC_LLM_MODEL=gpt-4o-mini
python crawler/comic_graph/run.py --llm
```

LLM 仅做简介中文化/清洗与标签归并；任何失败都安全回退到确定性结果，不中断管线。

## 产物契约（comics.json）

与旧爬虫完全一致，Node 端零改动：

```jsonc
[
  {
    "sourceId": "…",            // MangaDex 漫画 ID
    "title": "…", "author": "…", "description": "…",
    "region": "日漫", "status": "连载",
    "categories": ["奇幻"], "tags": ["奇幻"],
    "rating": 8.7, "views": 12345, "chapterCount": 60,
    "latestChapter": "第60话",
    "cover": "https://uploads.mangadex.org/covers/…",   // 远程 URL
    "banner": "https://uploads.mangadex.org/covers/…",
    "chapters": [{ "id": "…", "title": "第1话", "pages": 20 }]  // id = MangaDex 章节 ID
  }
]
```

> 章节 `id` 会被 Node 端存为 `Chapter.sourceId`，阅读时由服务端按需从
> MangaDex at-home 取真实页图 URL，本地不落任何图片。

## 扩展新数据源

实现 `sources/base.py` 的 `ComicSource` 协议并注册：

```python
from comic_graph.sources.base import ComicSource, RawManga, RawChapter
from comic_graph.sources import register_source

class MySource:
    name = "mysite"
    async def search(self, plan): ...
    async def chapters(self, manga_id, limit): ...
    async def stats(self, ids): ...
    def cover_url(self, manga_id, file_name, size=".256"): ...

register_source(MySource)
# 运行：python crawler/comic_graph/run.py --source mysite
```
