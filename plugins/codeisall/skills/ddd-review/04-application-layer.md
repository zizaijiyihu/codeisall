# 应用层编码规范

## Command Handler

```python
class PlaceOrderHandler:
    def __init__(self, repo: OrderRepository, publisher: EventPublisher):
        self.repo = repo
        self.publisher = publisher

    def handle(self, cmd: PlaceOrderCommand) -> str:
        order = Order.create(cmd.user_id, cmd.items)
        self.repo.save(order)
        for event in order.collect_events():
            self.publisher.publish(event)
        return order.id
```

| 规则编号 | 内容 |
|---------|------|
| APP-01 | Handler 通过构造函数注入依赖（接口类型），不得自行创建实例 |
| APP-02 | Handler 不包含业务规则，只做：加载 → 调用领域方法 → 持久化 → 发事件 |
| APP-03 | 一个 Handler 对应一个用例，不做多件事 |
| APP-04 | Handler 负责事务边界：先持久化，后发布事件 |

## Event Handler

```python
class OnOrderPlacedHandler:
    def __init__(self, repo: PointsAccountRepository):
        self.repo = repo

    def handle(self, event: OrderPlacedForPoints) -> None:
        account = self.repo.find_by_user_id(event.user_id)
        account.earn(3, reason=f"下单奖励:{event.order_id}")
        self.repo.save(account)
```

| 规则编号 | 内容 |
|---------|------|
| EH-01 | Event Handler 放在 `application/event_handler/` |
| EH-02 | 命名格式 `on_{event_name}.py`，类名 `On{EventName}Handler` |
| EH-03 | 事件处理失败应有补偿/重试策略，不得静默吞掉异常 |

## 事件机制职责分配

| 职责 | 归属层 | 说明 |
|------|--------|------|
| 产生事件 | domain | Aggregate Root 在业务方法中 append 到 `_events` |
| 收集事件 | application | Handler 调用 `root.collect_events()` |
| 决定何时发布 | application | Handler 在持久化成功后调用 `publisher.publish()` |
| 实现发布传输 | infrastructure | Kafka/RabbitMQ 等具体实现 |
| 注册订阅 | application（bootstrap） | 启动时注册 topic → handler 映射 |
| 实现订阅接收 | infrastructure | Consumer 轮询/回调 |
| 翻译外部事件 | infrastructure/acl | ACL 将外部 JSON → 本 Context 的内部类型 |
| 处理事件 | application/event_handler | 执行业务副作用 |

## 判断逻辑该放哪里

```
1. 逻辑涉及单个 Aggregate 内部状态变更？
   → Aggregate Root 方法

2. 逻辑涉及多个 Aggregate 的计算但不修改状态？
   → Domain Service

3. 逻辑是"加载 → 调用 → 保存"的编排？
   → Application Command Handler

4. 逻辑是响应一个已发生的事件？
   → Application Event Handler

5. 逻辑涉及调用外部系统？
   → Gateway 接口（domain）+ 实现（infrastructure）

6. 创建 Aggregate 的逻辑很复杂？
   → Factory

7. 对外暴露能力给其他 Context？
   → Open Host Service + Published Language
```
