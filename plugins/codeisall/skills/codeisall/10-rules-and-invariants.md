# 10 · 规则与不变量：判定、声明、守护

> **核心哲学**：声明性知识必须落到守护代码上 —— 装饰器位置 = 实现位置。
> 不允许"声明在一个地方，实现在另一个地方"的分离。

## 不变量 vs 业务规则：5 维度对比

| 维度 | 不变量（@invariant） | 业务规则（@business_rule） |
|------|---------------------|--------------------------|
| **作用域** | 单聚合内部 | **跨聚合**（涉及 ≥2 个聚合）|
| **一致性** | 强一致（事务内必满足） | 最终一致（可短暂违反，最终修复）|
| **守护者** | 聚合根的命令方法 | @event_handler 函数 或 @domain_service 方法 |
| **来源** | 建模时由领域逻辑自然产生 | 业务方明确给定（有 source）|
| **时态** | 永真（任何时刻都成立）| 触发式（特定时机生效）|

## 判定流程图

```
某条规则该用 @invariant 还是 @business_rule？
          │
          ↓
   涉及几个聚合？
   │
   ├── 1 个 → @invariant
   │   ↓
   │   写在聚合根的方法上（用 fields 关联属性）
   │   守护代码在 @command 方法体内（if / raise）
   │
   └── ≥2 个 → @business_rule
       ↓
       需要事务内即时满足吗？
       │
       ├── 是（同 ctx 内强一致）→ 写在 @domain_service 方法上
       │   守护代码就是该方法本身
       │
       └── 否（跨 ctx 最终一致）→ 写在 @event_handler 函数上
           守护代码就是该 handler 本身
```

## 判定示例

| 业务需求 | 涉及聚合 | 一致性 | 装饰器 | 写在哪 |
|---------|---------|-------|--------|--------|
| 订单总额 = 各行之和 | Order | 强 | @invariant | Order.add_line / Order.update |
| 已提交不可编辑 | WeeklyReport | 强 | @invariant | WeeklyReport.update_draft（pre check）|
| 库存不能为负 | Stock | 强 | @invariant | Stock.reserve（pre check）|
| 满 200 减 20 | Order + Promotion | 强（同 ctx 计算） | @business_rule | order/domain/services/pricing_service.py |
| 下单后预扣库存 | Order + Stock | 最终（跨 ctx） | @business_rule | inventory/application/handlers/on_order_placed.py |
| 下单送积分 | Order + PointsAccount | 最终（跨 ctx） | @business_rule | points/application/handlers/on_order_placed.py |
| 退款流程（多步 saga） | Order + Payment + Refund | 最终（多步） | @business_rule(id="BR-001") | 多个 handlers，按 id 聚合 |

## 装饰器声明规范

### @invariant（不变量）

```python
@aggregate_root(context="weekly_report", description="周报聚合根")
@dataclass
class WeeklyReport:

    @invariant(
        description="已提交不可编辑",
        formal="status ≠ 'draft' → content frozen",
        fields=["status", "content"],
    )
    def _inv_submitted_content_frozen(self): pass
    # ↑ 声明：方法名 _inv_xxx 是惯例
    # 守护：在 update_draft 等方法体内 if status != 'draft': raise
```

### @business_rule（业务规则）

**新 schema**（必须遵守）：

```python
@business_rule(
    rule="规则描述",                          # 必填
    source="规则来源（文档/政策/会议）",        # 必填
    involves=["Aggregate1", "Aggregate2"],   # 必填，≥2 个聚合
    timing="什么时机生效",                    # 必填
    id="BR-xxx",                              # 可选：多步 saga 用
    steps=["事件1", "事件2"],                 # 可选：多步 saga 用
)
```

**必须装饰在以下两种位置之一**：

```python
# 情况 A：跨 ctx 业务规则 → 装在 @event_handler 上
@business_rule(rule="下单送积分", involves=["Order", "PointsAccount"], ...)
@event_handler(event="OrderPlaced", from_context="order", ...)
def on_order_placed(payload, repo):
    # 守护代码就在这里
    points = ce_points(payload['amount'])
    account.earn(points)

# 情况 B：同 ctx 跨聚合 → 装在 @domain_service 的方法上
@domain_service(context="order", operates_on=["Order", "Promotion"])
class PricingService:

    @business_rule(rule="满 200 减 20", involves=["Order", "Promotion"], ...)
    def calculate_final_price(self, order, promotions):
        # 守护代码就在这里
        if order.total >= 200:
            order.total -= 20
```

**禁止**：

```python
# ❌ 独立的 business_rules.py 文件
@business_rule(rule="...", aggregate="Order")  # aggregate 单数字段
class XxxRule: pass  # 空类，没有守护代码

# lint 会报错：
#   business-rule-must-cross-aggregates
#   business-rule-must-attach-to-handler-or-service
```

## 多步 saga 规则

跨多个 handler 的业务规则（如退款流程）用 `id` 关联同一规则：

```python
# refund_ctx/application/handlers/on_refund_requested.py
@business_rule(id="BR-001", rule="退款流程", involves=["Order", "Payment", "Refund"],
    steps=["RefundRequested", "PaymentRefunded", "OrderCancelled"])
@event_handler(event="RefundRequested", from_context="customer_service")
def on_refund_requested(payload): ...

# refund_ctx/application/handlers/on_payment_refunded.py
@business_rule(id="BR-001", rule="退款流程", involves=["Order", "Payment", "Refund"])
@event_handler(event="PaymentRefunded", from_context="payment")
def on_payment_refunded(payload): ...

# order_ctx/application/handlers/on_refund_completed.py
@business_rule(id="BR-001", rule="退款流程", involves=["Order", "Payment", "Refund"])
@event_handler(event="RefundCompleted", from_context="refund")
def on_refund_completed(payload): ...
```

**看板按 id 聚合展示**，显示完整事件链。

## 反模式

| ❌ 反模式 | 后果 | 正确做法 |
|---------|------|---------|
| 单聚合规则用 @business_rule | lint `business-rule-must-cross-aggregates` 报错 | 改成 @invariant 放在聚合根 |
| @business_rule 写在 `class XxxRule: pass` 上 | lint `business-rule-must-attach-to-handler-or-service` 报错 | 装在 @event_handler 或 @domain_service 上 |
| 跨 ctx 用 @domain_service 协调 | 违反铁律 4（跨 ctx 必须事件化）| 用 @event_handler |
| @business_rule 没有 involves 字段 | lint 报错 | 必须列出 ≥2 个聚合 |
| 同一规则散落多处但没用 id 关联 | 看板显示成多条独立规则 | 多步 saga 必须用 id |

## Lint 保护

| 规则 | 检查 |
|------|------|
| `business-rule-must-cross-aggregates` | involves ≥ 2 |
| `business-rule-must-attach-to-handler-or-service` | 装饰位置必须是 @event_handler 或 @domain_service 方法 |
| `single-aggregate-rule-is-invariant` | 旧 `aggregate=` 字段 → 建议改 @invariant |
| `invariant-field-not-exist` | invariant 的 fields 引用必须存在 |

## 与 @verifies 的关系

每条规则都该有测试覆盖：

```python
# @invariant 的测试
@verifies(invariant="_inv_submitted_content_frozen", ...)
def test_edit_after_submit_raises(): ...

# @business_rule 的测试（未来扩展）
# 当前用 @verifies_command 在守护方法上覆盖：
@verifies_command(command="calculate_final_price", aspect="post", ...)
def test_full_minus_applied(): ...
```

**知识覆盖率检查**：看板"约束" Tab 显示每条规则的测试数量，⚠️ 未覆盖时让 AI 补测试。

## 一句话总结

> **不变量 = 单聚合内的永真规则，由聚合根命令方法守护。**
> **业务规则 = 跨聚合的触发式规则，由 @event_handler 或 @domain_service 守护。**
> **声明的装饰器位置 = 实现的代码位置，物理上不可分离。**

## 附：为什么 query 不在 domain 层

不变量 / 业务规则都是**写入侧**的规则——只有写入才会破坏它们，读取不会。

CQRS 的查询侧是 application 层的关注点分离：

| | 写（command） | 读（query） |
|---|---|---|
| 会破坏不变量吗 | 会 | 不会 |
| 是否触发事件 | 是 | 否 |
| 是否需要事务 | 是 | 否 |
| 装饰器所在层 | domain + application | **仅 application** |

### 那"只能看自己团队的周报"这种规则放哪？

这是**业务可见性规则**，是第三类业务规则（既不是 invariant，也不是 business_rule）：

```python
@query_handler(
    name="get_my_reports",
    visibility="只能看 user.team_id == requester.team_id 的周报",
    ...
)
def handle(...): ...
```

它在 `@query_handler.visibility` 字段声明，**不要写成 @invariant**（不变量不该跟"谁在调用"耦合）。

详见 02-decorator-vocabulary.md 的"CQRS 查询侧"段。
