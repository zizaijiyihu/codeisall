# 02 · 装饰器词汇表

> 完整文档参考 `ddd-python/README.md`。本文件只做快速查阅索引。

## 战略层（写在 `manifest.py`）

| 装饰器 | 必填参数 | 可选参数 | 说明 |
|--------|---------|----------|------|
| `@bounded_context` | id, name, type, responsibility | type_rationale | type 取值：`core` / `supporting` / `gennsibility 要写得**精确**，必要时直接说明"不做什么" |
| `@term` | term, definition | confusion | 统一语言术语，confusion = "这个词容易跟什么混淆" |

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
| `@business_rule` | rule, source, involves, timing | id, steps | 跨聚合业务规则（详见 `10-rules-and-invariants.md`） |

**关键约束**：
- `involves: list[str]` 必须 ≥ 2 个聚合（单聚合规则用 @invariant，不用这个）
- **必须装饰在 `@event_handler` 函数上 或 `@domain_service` 方法上**
- **禁止独立的 business_rules.py + class XxxRule: pass 模式**（lint 报错）

```python
# 跨 ctx 业务规则 → 装在 @event_handler 上
@business_rule(
    rule="下单送积分",
    source="营销规则",
    involves=["Order", "PointsAccount"],
    timing="消费 OrderPlaced 事件时",
)
@event_handler(event="OrderPlaced", from_context="order", ...)
def on_order_placed(payload, repo):
    # 守护代码就在这里
    ...

# 同 ctx 跨聚合业务规则 → 装在 @domain_service 方法上
@domain_service(context="order", operates_on=["Order", "Promotion"])
class PricingService:

    @business_rule(
        rule="满 200 减 20",
        source="市场部 v2.3",
        involves=["Order", "Promotion"],
        timing="计算最终价时",
    )
    def calculate_final_price(self, order, promotions):
        # 守护代码就在这里
        ...

# 多步 saga 规则 → 用 id 关联多个 handler
@business_rule(
    id="BR-001",
    rule="退款流程",
    involves=["Order", "Payment", "Refund"],
    steps=["RefundRequested", "PaymentRefunded", "OrderCancelled"],
    source="客服退款政策",
    timing="多步事件链",
)
@event_handler(event="RefundRequested", from_context="customer_service")
def on_refund_requested(payload): ...
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

## CQRS 查询侧（application 层装饰器）

> **重要**：查询路径**不属于 domain 层**，CQRS 是 application 层的关注点分离。
> domain 层只管写入规则（不变量 + 命令）；查询用 read model + query handler。
> 详见 `10-rules-and-invariants.md` 的"为什么 query 不在 domain 层"段。

| 装饰器 | 必填参数 | 可选参数 | 装饰对象 | 说明 |
|--------|---------|----------|---------|------|
| `@query_handler` | name, returns, reads_from, backed_by | visibility, description | 函数 | 查询用例（一个查询入口） |
| `@view_model` | name, fields, source | description | dataclass 类 | 读模型（查询返回的形态） |
| `@verifies_query` | query, aspect, context | description | 测试函数 | 声明测试验证哪个 query 的哪一面 |

### `@view_model` — 读模型

```python
# order_ctx/application/views/ot_view.py
from dataclasses import dataclass
from ddd import view_model

@view_model(
    name="OrderListView",
    fields=[
        {"name": "order_id", "type": "str", "description": "订单号"},
        {"name": "total_amount", "type": "Decimal"},
        {"name": "status", "type": "str"},
    ],
    source="read_model.orders_view",   # 数据来源（read model 表名或聚合投影）
    description="客户订单列表视图，按下单时间倒序",
)
@dataclass(frozen=True)
class OrderListView:
    order_id: str
    total_amount: object
    status: str
```

### `@query_handler` — 查询用例

```python
# order_ctx/application/queries/list_orders_by_customer.py
from ddd import query_handler
from ..views.order_list_view import OrderListView

@query_handler(
    name="list_orders_by_customer",
    returns="OrderListView",          # 必须对应一个已声明的 @view_model
    visibility="只能查询 requester.customer_id == query.customer_id 的订单",  # 业务可见性
    reads_from=["order_ctx"],         # 读哪些 ctx（跨 ctx 可写多个）
    backed_by="read_model",           # "read_model" | "aggregate_repo"
    description="按客户 ID 列出订单，按下单时间倒序",
)
def handle(query, requester) -> list[OrderListView]:
    """visibility 检查 + 读 read model + 映射到 view"""
    ...
```

### `@verifies_query` — 查询测试

```python
@verifies_query(
    query="list_orders_by_customer",
    aspect="visibility",   # visibility | filter | shape
    context="order",
    description="客户尝试查别人的订单时应被拒绝",
)
def test_cannot_see_other_customer_orders():
    ...
```

aspect 三种：
- `visibility` — 验证可见性规则（谁能看什么）
- `filter` — 验证过滤逻辑（按时间、状态等）
- `shape` — 验证返回 view model 的字段形态

### 目录约定

```
{ctx}_ctx/
├── domain/                          ← 写入规则（不变量 + 命令）
└── application/
    ├── handlers/   on_xxx.py         ← Command Handler（已有）
    ├── queries/    list_xxx.py       ← Query Handler（新增）
    └── views/      xxx_view.py       ← ReadModel / ViewModel（新增）
```

### 关联

- `@agent_tool(direction="query", maps_to="<query_handler_name>")` 把 Agent 工具映射到对应的 query handler
- lint 规则 `query-not-in-domain`、`query-handler-needs-view-model`、`agent-query-tool-needs-handler` 强制守护这些约定

## 铁律重申

1. **所有参数必须字面量**（字符串、列表、数字），不能用变量、f-string、函数调用
2. **方法体可以是 pass**（设计阶段），但装饰器要写全
3. **装饰器决定看板内容**，body 代码只影响业务逻辑，不影响看板呈现
