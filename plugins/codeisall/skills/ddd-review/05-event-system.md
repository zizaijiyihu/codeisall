# 事件机制设计标准

## 事件分类体系

| 事件类型 | 作用域 | 传输方式 | 定义位置 | 一致性 |
|---------|--------|---------|---------|--------|
| Domain Event | 单个 Bounded Context 内部 | 进程内总线 | `domain/event/` | 强一致（同事务） |
| Integration Event | 跨 Bounded Context | 消息队列（Kafka/RabbitMQ） | 生产方 `application/event/integration/` | 最终一致 |

| 规则编号 | 内容 |
|---------|------|
| EVT-BUS-01 | Domain Event 和 Integration Event 必须是不同的类，即使字段相似也不得复用 |
| EVT-BUS-02 | Domain Event 字段可以包含 Value Object；Integration Event 字段只允许基本类型（str, int, float, bool, list, dict） |
| EVT-BUS-03 | Domain Event → Integration Event 的转换逻辑放在 `infrastructure/messaging/` 中，不放在领域层 |

## 事件总线接口定义

### 进程内事件总线（同 Context 内）

```python
# domain/event/event_bus.py
from typing import Protocol, Callable

class DomainEventBus(Protocol):
    """进程内同步/异步事件分发"""
    def subscribe(self, event_type: type, handler: Callable) -> None: ...
    def publish(self, event: object) -> None: ...
```

```python
# infrastructure/messaging/in_memory_event_bus.py
class InMemoryEventBus:
    def __init__(self):
        self._handlers: dict[type, list[Callable]] = {}

    def subscribe(self, event_type: type, handler: Callable) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def publish(self, event: object) -> None:
        for handler in self._handlers.get(type(event), []):
            handler(event)
```

### 跨 Context 事件发布器

```python
# application/port/integration_event_publisher.py
from typing import Protocol

class IntegrationEventPublisher(Protocol):
    """跨 Context 消息发布，实现由 infrastructure 提供"""
    def publish(self, topic: str, event: dict) -> None: ...
```

```python
# infrastructure/messaging/kafka_event_publisher.py
import json
from kafka import KafkaProducer

class KafkaIntegrationEventPublisher:
    def __init__(self, producer: KafkaProducer):
        self.producer = producer

    def publish(self, topic: str, event: dict) -> None:
        self.producer.send(topic, json.dumps(event).encode())
```

| 规则编号 | 内容 |
|---------|------|
| EVT-BUS-04 | 进程内总线接口定义在 `domain/event/`，跨 Context 发布器接口定义在 `application/port/` |
| EVT-BUS-05 | 总线实现统一放在 `infrastructure/messaging/` |
| EVT-BUS-06 | 进程内总线用于同 Context 内 Aggregate 间的协调；跨 Context 必须用消息队列 |
| EVT-BUS-07 | 禁止在进程内总线中同步调用跨 Context 的逻辑 |

## 事件选型决策

```
1. 生产方和消费方在同一个 Bounded Context 内？
   ├── 是 → Domain Event + 进程内总线
   └── 否 → 继续判断 ↓

2. 消费方是否需要实时响应（<100ms）？
   ├── 是 → Integration Event + 消息队列（低延迟配置）
   └── 否 → Integration Event + 消息队列（标准配置）

3. 是否需要保证顺序？
   ├── 是 → 单 partition + 同一 key
   └── 否 → 多 partition 提高吞吐

4. 是否能容忍丢失？
   ├── 能 → at-most-once（发完不管）
   └── 不能 → 使用 Outbox 模式
```

## 事件生命周期与流转

### 同 Context 内（进程内）

```
Aggregate Root
  │ self._events.append(DomainEvent)
  ▼
Command Handler
  │ events = root.collect_events()
  │ for e in events: event_bus.publish(e)
  ▼
InMemoryEventBus
  │ 查找订阅该事件类型的 handler
  ▼
Event Handler (application/event_handler/)
  │ 执行副作用（同事务或新事务）
  ▼
结束
```

### 跨 Context（消息队列）

```
Aggregate Root
  │ self._events.append(DomainEvent)
  ▼
Command Handler
  │ events = root.collect_events()
  │ 写入 Outbox 表（同事务）
  ▼
Outbox Relay（独立进程/定时任务）
  │ 读取未发送记录
  │ DomainEvent → IntegrationEvent（转换）
  │ 发送到消息队列
  │ 标记为已发送
  ▼
消息队列（Kafka / RabbitMQ）
  ▼
消费方 EventSubscriber (infrastructure/messaging/)
  │ 接收 JSON 消息
  ▼
ACL (infrastructure/acl/)
  │ JSON → 本 Context 领域类型
  ▼
Event Handler (application/event_handler/)
  │ 加载 Aggregate → 调用业务方法 → 保存
  ▼
结束
```

## Outbox 模式（跨 Context 发布的推荐方式）

```python
# infrastructure/persistence/outbox.py
@dataclass
class OutboxRecord:
    id: str
    event_type: str
    payload: str             # JSON
    created_at: datetime
    published: bool = False

class OutboxRepository(Protocol):
    def save(self, record: OutboxRecord) -> None: ...
    def find_unpublished(self, limit: int = 100) -> list[OutboxRecord]: ...
    def mark_published(self, record_id: str) -> None: ...
```

```python
# application/command/place_order.py
class PlaceOrderHandler:
    def __init__(self, repo: OrderRepository, outbox: OutboxRepository):
        self.repo = repo
        self.outbox = outbox

    def handle(self, cmd: PlaceOrderCommand) -> str:
        order = Order.create(cmd.user_id, cmd.items)
        # 同一事务内：保存 Aggregate + 写 Outbox
        self.repo.save(order)
        for event in order.collect_events():
            self.outbox.save(OutboxRecord(
                id=str(uuid4()),
                event_type=type(event).__name__,
                payload=self._serialize(event),
                created_at=datetime.now(),
            ))
        return order.id
```

```python
# infrastructure/messaging/outbox_relay.py
class OutboxRelay:
    """独立进程：轮询 Outbox 表，发送到消息队列"""
    def __init__(self, outbox: OutboxRepository, publisher: IntegrationEventPublisher):
        self.outbox = outbox
        self.publisher = publisher

    def run_once(self) -> int:
        records = self.outbox.find_unpublished(limit=100)
        for record in records:
            self.publisher.publish(
                topic=self._resolve_topic(record.event_type),
                event=json.loads(record.payload),
            )
            self.outbox.mark_published(record.id)
        return len(records)
```

| 规则编号 | 内容 |
|---------|------|
| REL-01 | 跨 Context 事件发布必须使用 Outbox 模式，禁止"先发消息后提交事务"或"先提交事务后发消息" |
| REL-02 | Outbox 写入必须与业务数据在同一个数据库事务中 |
| REL-03 | Outbox Relay 作为独立进程或定时任务运行，不与业务请求耦合 |

## 消费端幂等性

```python
# infrastructure/messaging/idempotent_handler.py
class IdempotentEventHandler:
    """装饰器：基于 event_id 去重"""
    def __init__(self, inner_handler: Callable, processed_store: ProcessedEventStore):
        self.inner = inner_handler
        self.store = processed_store

    def handle(self, event_id: str, event: object) -> None:
        if self.store.is_processed(event_id):
            return
        self.inner(event)
        self.store.mark_processed(event_id)
```

| 规则编号 | 内容 |
|---------|------|
| REL-04 | 消费端 Event Handler 必须保证幂等：相同事件处理多次结果不变 |
| REL-05 | 幂等实现方式二选一：a) 基于 event_id 去重表；b) 业务操作本身天然幂等 |
| REL-06 | 使用 b) 时必须在代码注释中说明幂等性由哪个业务约束保证 |

## Integration Event 契约规范

```python
# application/event/integration/order_placed_v1.py
@dataclass(frozen=True)
class OrderPlacedV1:
    """Integration Event — 对外契约"""
    # 元信息（必选字段）
    event_id: str              # 全局唯一，用于幂等
    event_type: str            # 固定值 "order.placed"
    version: str               # "1.0"
    timestamp: str             # ISO 8601

    # 业务载荷（只用基本类型）
    order_id: str
    user_id: str
    total_amount: float
```

| 规则编号 | 内容 |
|---------|------|
| INT-01 | Integration Event 必须包含四个元信息字段：`event_id`, `event_type`, `version`, `timestamp` |
| INT-02 | `event_id` 由生产方生成，全局唯一（UUID），消费方用于幂等去重 |
| INT-03 | `version` 用于 Schema 演进，消费方必须检查版本号并拒绝不认识的版本 |
| INT-04 | 向后兼容变更（加字段）不升大版本；不兼容变更（改/删字段、改语义）必须升大版本并保持旧版本可用 |
| INT-05 | Integration Event 类命名格式 `{EventName}V{Major}`，如 `OrderPlacedV1` |
