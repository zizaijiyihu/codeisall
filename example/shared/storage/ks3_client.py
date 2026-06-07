"""共享：KS3 对象存储"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="ks3", name="KS3 Storage", icon="📦", kind="storage",
    description="对象存储（S3 兼容）",
)
class KS3Client: pass
