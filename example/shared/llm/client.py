"""共享：LLM 客户端"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="llm", name="LLM Client", icon="🤖", kind="ai",
    description="大模型调用封装（Anthropic 风格）",
)
class LLMClient: pass
