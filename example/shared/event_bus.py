"""共享基础设施声明 - shared/ 目录下每个模块用 @shared_infrastructure 装饰自己

shared 里只有纯技术能力，没有业务语义
"""
from ddd import shared_infrastructure


@shared_infrastructure(
    id="event_bus", name="Event Bus", icon="📡", kind="messaging",
    description="进程内事件总线，跨 Context 通信",
)
class EventBus:
    """进程内事件总线 - 零业务语义"""
    _handlers: dict = {}

    def subscribe(self, event_type, handler):
        self._handlers.setdefault(event_type, []).append(handler)

    def publish(self, event_type, payload):
        for handler in self._handlers.get(event_type, []):
            handler(payload)


bus = EventBus()
