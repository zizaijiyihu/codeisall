# 依赖规则与跨 Context 通信

## 层间依赖方向

```
interface/ → application/ → domain/
                              ↑
infrastructure/ ──────────────┘
```

## 依赖规则

| 规则编号 | 内容 | 违反后果 |
|---------|------|---------|
| DEP-01 | `domain/` 不得 import 任何其他层的模块 | 领域层被技术绑架 |
| DEP-02 | `domain/` 不得 import 第三方库（dataclasses、typing、datetime、uuid、decimal、enum、abc、collections.abc、re 除外） | 领域层不纯 |
| DEP-03 | `application/` 不得 import `infrastructure/` 的具体实现类 | 依赖倒置失效 |
| DEP-04 | `infrastructure/` 只能依赖 `domain/` 中定义的接口 | 实现反向依赖 |
| DEP-05 | Bounded Context 之间不得存在代码级 import | Context 边界泄漏 |

## 依赖倒置实现方式

```python
# domain/repository/order_repo.py —— 接口定义
from typing import Protocol

class OrderRepository(Protocol):
    def find_by_id(self, order_id: str) -> "Order | None": ...
    def save(self, order: "Order") -> None: ...

# infrastructure/persistence/order_repo_mysql.py —— 实现
from domain.aggregate.order.order import Order
from domain.repository.order_repo import OrderRepository

class OrderRepositoryMySQL:  # 隐式实现 Protocol，不需要继承
    def find_by_id(self, order_id: str) -> Order | None: ...
    def save(self, order: Order) -> None: ...
```

## 跨 Context 通信规则

| 规则编号 | 内容 |
|---------|------|
| COM-01 | Context 间只能通过 Integration Event（消息队列）或 Open Host Service（HTTP/gRPC）通信 |
| COM-02 | 消费方必须通过 ACL 将外部消息翻译为本 Context 的领域类型 |
| COM-03 | 不得直接反序列化为其他 Context 的 Domain Event 类 |

## allowed imports 速查

| 层 | 可 import 的来源 |
|----|-----------------|
| domain | 标准库白名单 + 同层其他模块 |
| application | domain + 标准库 + typing |
| infrastructure | domain + application（仅 DTO）+ 任意第三方库 |
| interface | application + domain（仅 DTO/VO）+ Web 框架 |
