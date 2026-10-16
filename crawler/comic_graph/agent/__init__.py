"""ReAct 式采集 Agent（LangGraph）。

配了 LLM Key 时由大模型决策调用工具（search/get_chapters/collect）收集漫画；
未配置时上层回退到确定性管线。``chat_fn`` 可注入以便无 Key 联调。
"""

from .graph import build_agent_graph, run_agent
from .state import AgentState
from .tools import ToolContext, build_tools

__all__ = [
    "AgentState",
    "ToolContext",
    "build_tools",
    "build_agent_graph",
    "run_agent",
]
