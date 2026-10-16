"""帧间漫画 —— LangGraph 在线数据管线.

针对 Electron 桌面端「帧间漫画」项目：从可扩展的在线漫画数据源
（默认 MangaDex）抓取漫画元数据与章节，归一化成 Node 服务端约定的
``comics.json`` 契约，使漫画与章节「开箱即用」真实网络数据。

默认纯确定性（仅 MangaDex API，零 Key 即可跑）；配置 LLM 相关环境变量后，
自动启用大模型做简介清洗/翻译、标签归并（见 ``llm.py``）。

输出：``crawler/output/comics.json``
"""

__version__ = "1.0.0"
