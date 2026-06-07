# 02 · 装饰器词汇表

> 完整文档参考 `ddd-python/README.md`。本文件只做快速查阅索引。

## 战略层（写在 `manifest.py`）

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@bounded_context` | id, name, type, responsibility | type_rationale | type 取值：`core` / `supporting` / `generic` |
| `@term` | term, definition | confusion | 统一语言术语，confusion = "这个词容易跟什么混淆" |
| `@routing_rule` | keyword, belongs | not_belongs | 需求分发规则，"遇到 keyword 归 belongs Context" |
| `@not_responsible` | responsibility | — | Context 不负责的职责 |

示例：

```python
@bounded_context(
    id="order",
    name="订单",
    type="core",
    type_rationale="订单是业务核心流程的主体",
    responsibility="管理订单的创建、支付、取消全生命周期",
)
@term(term="下单", definition="顾客确认购买意向并创建订单", confusion="不同于加购物车")
@routing_rule(keyword="下单", belongs="order", not_belongs="支付")
@not_responsible(responsibility="库存扣减")
class OrderContext: pass
```

## 战术层 — 聚合 / 实体 / VO

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@aggregate_root` | context | description | 聚合根，context 对应 manifest.py 里的 id |
| `@entity` | context | description | 实体，必须被聚合根持有 |
| `@value_object` | context | description, frozen | 值对象，默认 frozen=True |
| `@vo_constraint` | (位置参数 str) | — | 值对象的约束（可叠加多个） |

聚合根必须配合 `@dataclass`：

```python
from dataclasses import dataclass
from ddd.decorators import aggregate_root, invariant, command

@aggregate_root(context="order", description="订单聚合根")
@dataclass
class Order:
    id: str
    ...
```

## 战术层 — 不变量 / 命令

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@invariant` | description | formal, fields | 不变量。fields 列出涉及的属性名，formal 是形式化表达 |
| `@command` | emits | pre, post, not_do, fails, operation | 方法契约。emits = 发布的事件名 |

写在聚合根的方法上：

```python
@aggregate_root(context="order", description="订单聚合根")
@dataclass
class Order:
    id: str
    status: str
    total: Decimal

    @invariant(
        description="订单总金额必须等于商品行金额之和",
        formal="sum(lines.subtotal) == total",
        fields=["total", "lines"],
    )
    def _inv_total_consistency(self): pass

    @command(
        emits="OrderPlaced",
        pre="status == 'draft' 且 lines 非空",
        post="status 变为 placed，库存预扣成功",
        fails="InsufficientStock | EmptyOrder",
    )
    def place(self): pass
```

**方法 body 是 `pass` 也没关系** —— 看板只看装饰器，不看实现。设计阶段全是 pass；实现阶段再填。

## 战术层 — 领域服务

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@domain_service` | context | description, operates_on | operates_on = 协作的聚合根列表 |

```python
@domain_service(
    context="order",
    description="订单定价：跨 Order 与 Promotion 计算最终价格",
    operates_on=["Order", "Promotion"],
)
class PricingService:
    def calculate_final_price(self, order, promotions):
        pass
```

看板会把 PricingService 显示为黄色独立节点，并用协作边连接到 Order 和 Promotion。

## 战术层 — 不负责详情

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@not_responsible_for` | responsibility, owner, collaboration | — | 某聚合不负责的职责 + 谁负责 + 怎么协作 |

```python
@aggregate_root(context="order", description="订单聚合根")
@not_responsible_for(
    responsibility="库存扣减",
    owner="inventory.Stock",
    collaboration="OrderPlaced 事件触发 Stock.reserve()",
)
class Order: ...
```

## 事件 / 集成

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@event_handler` | event, from_context | relation_type, integration, label, data_flow, failure_strategy | 跨 ctx 事件消费者 |
| `@non_consumer_of` | event | reason | 显式声明不消费某事件（否则 lint 会警告） |

```python
# payment_ctx/application/handlers/on_order_placed.py
from ddd.decorators import event_handler

@event_handler(
    event="OrderPlaced",
    from_context="order",
    relation_type="customer-supplier",
    integration="event",
    label="创建支付单",
    data_flow="order_id, amount → 创建 pending Payment",
    failure_strategy="重试 3 次后人工介入",
)
def on_order_placed(payload):
    pass
```

relation_type 取值：`customer-supplier` / `conformist` / `anticorruption-layer` / `shared-kernel` / `open-host-service` / `published-language` / `separate-ways`

integration 取值：`event` / `api` / `shared-db`

## 业务规则

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@business_rule` | rule, source, aggregate, timing | — | 业务规则溯源 |

```python
# business_rules.py
from ddd.decorators import business_rule

@business_rule(
    rule="满 200 减 20",
    source="市场部文档 v2.3",
    aggregate="Order",
    timing="place() 前计算折扣",
)
class FullMinus: pass
```

## 共享基础设施

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@shared_infrastructure` | id, name | icon, kind, description | 跨 ctx 的纯技术能力（无业务语言） |

```python
# shared/event_bus.py
from ddd.decorators import shared_infrastructure

@shared_infrastructure(
    id="event_bus",
    name="事件总线",
    icon="📡",
    kind="messaging",
    description="进程内发布-订阅，无持久化",
)
class EventBus: ...
```

## 铁律重申

1. **所有参数必须字面量**（字符串、列表、数字），不能用变量、f-string、函数调用
2. **方法体可以是 pass**（设计阶段），但装饰器要写全
3. **装饰器决定看板内容**，body 代码只影响业务逻辑，不影响看板呈现
