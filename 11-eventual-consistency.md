# 11 · 最终一致性保障

> 跨聚合 / 跨 ctx 的业务规则必须用最终一致性。本文档定义保障机制 + 代码模板 + 审查清单。

## 何时需要最终一致性

| 场景 | 一致性策略 |
|------|----------|
| 单聚合内的不变量 | 强一致（@invariant + 聚合根命令方法）|
| 同 ctx 跨聚合的协调 | 强一致（@domain_service 单事务）|
| **跨 ctx 的业务规则** | **最终一致**（@event_handler 事件驱动）|

## 保障机制（按可靠性递增）

```
Level 1: 单 Handler             基础，事件 → 单次操作
Level 2: 幂等 Handler            防重复消费
Level 3: Outbox 模式             防事件丢失
Level 4: Saga / Process Manager  防失败 + 补偿
Level 5: 死信队列 + 人工介入      兜底
```

### Level 1: 单 Handler（基础）

```python
@event_handler(event="OrderPlaced", from_context="order")
def on_order_placed(payload, repo):
    """收到事件 → 调聚合命令 → 持久化"""
    account = repo.find_by_user(payload['user_id'])
    account.earn(payload['amount'] // 10)  # 1 元 = 0.1 积分
    repo.save(account)
```

**问题**：重复消费会重复加积分；网络抖动 handler 抛错事件丢失。

### Level 2: 幂等 Handler（防重复）

```python
@event_handler(event="OrderPlaced", from_context="order")
def on_order_placed(payload, repo, processed_events_repo):
    event_id = payload['event_id']

    # 幂等检查：已处理过则跳过
    if processed_events_repo.exists(event_id):
        return

    account = repo.find_by_user(payload['user_id'])
    account.earn(payload['amount'] // 10)
    repo.save(account)
    processed_events_repo.mark_processed(event_id)
```

**保证**：同一事件多次到达，业务效果只产生一次。

### Level 3: Outbox 模式（防事件丢失）

发布方：事件先写 outbox 表（跟业务数据同事务），再由后台进程发布。

```python
# 发布方（同事务保证不丢）
@command(emits="OrderPlaced")
def place(self):
    self.status = 'placed'
    # 不直接 publish，写到 _events 由 application 层在持久化时一起写 outbox
    self._events.append(OrderPlaced(order_id=self.id, ...))

# application Handler
def submit_handler(repo, outbox):
    with transaction:
        order.place()
        repo.save(order)
        outbox.append_all(order.collect_events())  # 同一事务
    # 后台 outbox poller 异步发布事件
```

**保证**：业务数据持久化 = 事件已就绪发布，不会出现"业务成功但事件丢失"。

### Level 4: Saga / Process Manager（多步业务规则）

多步业务规则用 `@business_rule(id="BR-xxx")` 关联，每步可能需要补偿：

```python
# 退款 saga
@business_rule(id="BR-001", rule="退款流程",
    involves=["Order", "Payment", "Refund"],
    steps=["RefundRequested", "PaymentRefunded", "OrderCancelled"])
@event_handler(event="RefundRequested", from_context="customer_service")
def on_refund_requested(payload, payment_client, saga_state):
    """Step 1: 触发支付退款"""
    saga_state.start(payload['saga_id'])
    payment_client.refund(payload['payment_id'])  # → PaymentRefunded 或 PaymentRefundFailed

@business_rule(id="BR-001", ...)
@event_handler(event="PaymentRefunded", from_context="payment")
def on_payment_refunded(payload, order_repo, saga_state):
    """Step 2: 取消订单"""
    saga_state.advance(payload['saga_id'], 'payment_refunded')
    order = order_repo.find(payload['order_id'])
    order.cancel(reason="refund")
    order_repo.save(order)

@business_rule(id="BR-001", ...)
@event_handler(event="PaymentRefundFailed", from_context="payment")
def on_payment_refund_failed(payload, saga_state, notification):
    """补偿：支付退款失败 → 通知人工"""
    saga_state.fail(payload['saga_id'], reason=payload['error'])
    notification.alert(f"退款失败: {payload['saga_id']}")
```

**保证**：每步可单独失败可补偿，状态由 saga_state 跟踪。

### Level 5: 死信队列 + 人工介入

超过重试次数的事件进死信队列，人工处理：

```python
@event_handler(
    event="OrderPlaced",
    from_context="order",
    failure_strategy="重试 3 次 → 死信队列 → 人工介入",
)
def on_order_placed(payload, repo):
    try:
        ...
    except RetryableError:
        raise  # 中间件按 failure_strategy 重试
    except FatalError as e:
        deadletter.send(payload, error=str(e))
        notification.alert(f"OrderPlaced 处理失败: {e}")
```

## ACL 翻译（跨 ctx 必备）

跨 ctx 的事件 payload 是上游 ctx 的格式，必须翻译成本 ctx 的格式：

```python
@event_handler(event="TaskSnapshotsReady", from_context="task_integration")
def on_task_snapshots_ready(payload, repo):
    # ACL 翻译：FetchedTask（上游格式）→ TaskSnapshot（本 ctx 格式）
    task_snapshots = [
        {
            "task_id": f"{ft['origin']['source']}:{ft['origin']['external_id']}",
            "title": ft['title'],
            "status": ft['status'],
            "source": ft['origin']['source'],
            "url": ft['url'],
        }
        for ft in payload['fetched_tasks']
    ]
    # 用本 ctx 格式调聚合命令
    report.draft_from_tasks(payload['author_id'], payload['week'], task_snapshots)
```

**禁止**：直接用上游 ctx 的类（违反 cross-context-import lint）。

## failure_strategy 字段写法

`@event_handler(failure_strategy="...")` 必须明确说明：

| 策略 | 写法 | 适用 |
|------|------|------|
| 重试 | "重试 N 次后死信" | 网络抖动 / 临时错误 |
| 降级 | "失败时记日志，不影响主流程" | 非关键路径 |
| 补偿 | "触发 XxxCompensation 事件" | 多步 saga |
| 人工 | "告警 + 人工介入" | 异常路径 |
| 忽略 | "幂等忽略（已处理）" | 重复消费 |

**禁止**：留空或写"TODO"。

## 审查清单（实现完成前必检）

```
□ 跨 ctx 操作是否都通过事件？（不能 import 对方）
□ 每个 @event_handler 是否幂等？（重复消费不重复执行）
□ failure_strategy 字段是否明确写了？
□ 跨 ctx payload 是否做了 ACL 翻译？（不直接用上游格式）
□ 多步业务规则是否用 @business_rule(id="...") 关联？
□ 补偿事件（XxxCompensation）是否实现？
□ 死信队列 / 告警通道是否就绪？
□ Outbox 模式是否启用？（金融场景必须）
```

## 一句话总结

> **跨 ctx = 最终一致 = 事件驱动 + 幂等 + 失败策略 + ACL 翻译。**
> **每个 @event_handler 都必须能说清：失败了怎么办、重复了怎么办、上游格式变了怎么办。**
