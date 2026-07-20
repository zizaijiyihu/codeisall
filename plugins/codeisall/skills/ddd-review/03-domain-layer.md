# 领域层编码规范

## Aggregate Root

```python
@dataclass
class Order:
    id: OrderId                                              # 1. 唯一标识
    status: OrderStatus                                      # 2. 内部状态
    lines: list[OrderLine] = field(default_factory=list)
    _events: list = field(default_factory=list, repr=False)  # 3. 事件暂存（私有）

    def place(self) -> None: ...                             # 4. 业务行为方法（动词命名）
    def cancel(self, reason: str) -> None: ...

    def collect_events(self) -> list:                        # 5. 事件收集方法
        events = self._events[:]
        self._events.clear()
        return events
```

| 规则编号 | 内容 |
|---------|------|
| AGG-01 | Aggregate Root 必须有唯一标识字段 |
| AGG-02 | 外部不得直接修改 Root 内部 Entity 的属性，所有修改必须通过 Root 的方法 |
| AGG-03 | Root 的业务方法负责校验不变量（invariant），不依赖调用方保证 |
| AGG-04 | Root 产生 Domain Event 时只暂存在 `_events` 列表，不得直接调用发布 |
| AGG-05 | 一个事务只操作一个 Aggregate，跨 Aggregate 修改通过事件最终一致 |
| AGG-06 | Root 方法不得接收 Repository、Service 等基础设施接口作为参数 |

## Entity

```python
@dataclass
class OrderLine:
    id: str                  # Entity 必须有标识
    product_id: str
    quantity: int
    price: Money

    def change_quantity(self, new_qty: int) -> None:
        if new_qty <= 0:
            raise DomainError("数量必须为正")
        self.quantity = new_qty
```

| 规则编号 | 内容 |
|---------|------|
| ENT-01 | Entity 必须有标识字段，通过标识判断相等 |
| ENT-02 | 非 Root 的 Entity 不能被外部直接持有引用 |
| ENT-03 | Entity 可以包含业务逻辑，但不变量的最终守护在 Root |

## Value Object

```python
@dataclass(frozen=True)  # 必须 frozen
class Money:
    amount: Decimal
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            raise DomainError("金额不能为负")

    def add(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise DomainError("币种不同不能相加")
        return Money(amount=self.amount + other.amount, currency=self.currency)
```

| 规则编号 | 内容 |
|---------|------|
| VO-01 | Value Object 必须使用 `@dataclass(frozen=True)` |
| VO-02 | Value Object 通过所有字段值判断相等（`frozen=True` 自动满足） |
| VO-03 | Value Object 无标识字段 |
| VO-04 | Value Object 的"修改"必须返回新实例，不得原地修改 |

## Domain Event

```python
@dataclass(frozen=True)
class OrderPlaced:
    order_id: str
    user_id: str
    placed_at: datetime
```

| 规则编号 | 内容 |
|---------|------|
| EVT-01 | Domain Event 必须 `frozen=True`，事件是已发生的事实，不可修改 |
| EVT-02 | Event 命名用过去式动词（OrderPlaced, PaymentConfirmed） |
| EVT-03 | Event 字段使用基本类型或 Value Object，不得包含 Entity/Aggregate 引用 |
| EVT-04 | Event 不包含行为方法 |

## Domain Service

```python
class PricingService:
    """跨 Aggregate 的业务逻辑，不属于任何一个 Root"""
    def calculate_discount(self, order: Order, user_level: UserLevel) -> Money:
        ...
```

| 规则编号 | 内容 |
|---------|------|
| SVC-01 | Domain Service 是无状态的 |
| SVC-02 | 只有不属于任何单一 Aggregate 的逻辑才放 Domain Service |
| SVC-03 | Domain Service 不得依赖基础设施（如需外部数据，通过 Gateway 接口） |

## Repository 接口

| 规则编号 | 内容 |
|---------|------|
| REPO-01 | 只为 Aggregate Root 定义 Repository，不为内部 Entity 单独建 |
| REPO-02 | Repository 接口使用 `Protocol` 定义，放在 `domain/repository/` |
| REPO-03 | 接口方法参数和返回值只使用领域对象，不出现 ORM 模型或 dict |
| REPO-04 | 接口不暴露事务控制方法（begin/commit/rollback） |

## Factory

| 规则编号 | 内容 |
|---------|------|
| FAC-01 | 创建逻辑简单时用 `@classmethod` 放在 Root 上，不单独建 Factory |
| FAC-02 | 创建逻辑超过 20 行或有多种创建路径时抽出独立 Factory 类 |
| FAC-03 | Factory 负责保证创建出的 Aggregate 处于合法状态 |
| FAC-04 | Factory 放在对应 Aggregate 目录内 |
