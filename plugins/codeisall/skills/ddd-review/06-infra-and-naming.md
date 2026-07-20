# 基础设施层规范与命名规范

## Repository 实现

| 规则编号 | 内容 |
|---------|------|
| INF-01 | 实现类放在 `infrastructure/persistence/` |
| INF-02 | ORM Model 是基础设施层的私有概念，不出现在 domain 和 application 中 |
| INF-03 | Repository 实现负责 Domain Object ↔ ORM Model 的双向转换 |
| INF-04 | 隐式实现 Protocol，不需要显式继承 |

## 防腐层（ACL）

```python
class OrderEventTranslator:
    def translate(self, raw: dict) -> OrderPlacedForPoints | None:
        if raw.get("event_type") != "order.placed":
            return None
        payload = raw["payload"]
        return OrderPlacedForPoints(
            user_id=payload["user_id"],
            order_id=payload["order_id"],
        )
```

| 规则编号 | 内容 |
|---------|------|
| ACL-01 | ACL 放在消费方的 `infrastructure/acl/` |
| ACL-02 | ACL 输出本 Context 自定义的类型，不得直接输出外部 Context 的类 |
| ACL-03 | 外部 Schema 变化时，只改 ACL 代码，domain 和 application 不动 |

## Open Host Service & Published Language

| 规则编号 | 内容 |
|---------|------|
| OHS-01 | Open Host Service 放在 `interface/open_host/` |
| OHS-02 | Published Language（Schema）独立于 Domain Event，单独定义在 `schema/` |
| OHS-03 | Schema 变更需要版本号管理，向后不兼容变更必须升版本 |
| OHS-04 | Schema 字段只使用基本类型（str, int, float, bool, list, dict），不引用领域类 |

---

## 文件命名

| 组件 | 文件命名 | 示例 |
|------|---------|------|
| Aggregate Root | `{root_name}.py` | `order.py` |
| Entity | `{entity_name}.py` | `order_line.py` |
| Value Object | `{vo_name}.py` | `money.py` |
| Domain Event | `{past_tense_verb}.py` | `order_placed.py` |
| Repository 接口 | `{root_name}_repo.py` | `order_repo.py` |
| Repository 实现 | `{root_name}_repo_{tech}.py` | `order_repo_mysql.py` |
| Factory | `{root_name}_factory.py` | `order_factory.py` |
| Command Handler | `{use_case}.py` | `place_order.py` |
| Event Handler | `on_{event_name}.py` | `on_order_placed.py` |
| ACL | `{external_context}_acl.py` | `inventory_acl.py` |
| Gateway 接口 | `{capability}_gateway.py` | `payment_gateway.py` |
| Integration Event | `{event_name}_v{major}.py` | `order_placed_v1.py` |

## 类命名

| 组件 | 类命名格式 | 示例 |
|------|-----------|------|
| Aggregate Root | PascalCase 名词 | `Order` |
| Entity | PascalCase 名词 | `OrderLine` |
| Value Object | PascalCase 名词 | `Money`, `Address` |
| Domain Event | PascalCase 过去分词 | `OrderPlaced`, `PaymentConfirmed` |
| Repository 接口 | `{Root}Repository` | `OrderRepository` |
| Command | `{Action}{Root}Command` | `PlaceOrderCommand` |
| Command Handler | `{Action}{Root}Handler` | `PlaceOrderHandler` |
| Event Handler | `On{Event}Handler` | `OnOrderPlacedHandler` |
| Domain Service | `{Noun}Service` | `PricingService` |
| Factory | `{Root}Factory` | `OrderFactory` |
| Integration Event | `{EventName}V{Major}` | `OrderPlacedV1` |

## 方法命名

| 场景 | 规则 | 正确 | 错误 |
|------|------|------|------|
| Root 业务行为 | 动词 | `order.place()` | `order.set_status("placed")` |
| Root 查询 | is/has/can 前缀 | `order.is_cancellable()` | `order.check_cancel()` |
| Value Object 操作 | 动词，返回新实例 | `money.add(other)` | `money.plus(other)` |
| Repository 查询 | `find_by_{field}` | `find_by_id()` | `get()`, `query()` |
| Repository 持久化 | `save` | `save(order)` | `insert()`, `update()` |
| Factory 创建 | `create_from_{source}` | `create_from_cart()` | `build()`, `make()` |
| Event Handler | `handle` | `handle(event)` | `process()`, `on_event()` |
