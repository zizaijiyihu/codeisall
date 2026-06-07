"""共享：Redis 缓存"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="redis", name="Redis", icon="💾", kind="cache",
    description="缓存与分布式锁",
)
class RedisClient: pass
