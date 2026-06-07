"""共享：MySQL 客户端"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="mysql", name="MySQL", icon="🗄", kind="database",
    description="关系型存储（各 Context 独立 schema）",
)
class MySQLClient: pass
