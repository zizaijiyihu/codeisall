"""共享：PDF 解析"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="pdf", name="PDF Parser", icon="📄", kind="tool",
    description="PDF 文档解析",
)
class PDFParser: pass
