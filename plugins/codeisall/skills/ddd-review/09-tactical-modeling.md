# 战术设计建模标准

> 本文件定义战术设计文档的产出物规格和评判规则。
> 建模 AI 按规格产出文档，检查 AI 按评判规则逐条验证。

---

## 产出物规格

战术设计文档以 **Aggregate 卡片** 为核心单元，每个 Aggregate 一张卡片。
卡片之外还需要：事件清单、业务规则归属表。

### 一、Aggregate 卡片

每个 Aggregate 必须填写以下字段：

#### 基本信息

| 字段 | 说明 | 示例 |
|------|------|------|
| 所属 Context | 归属哪个 Bounded Context | order |
| Aggregate 名称 | 英文标识 | order |
| Aggregate Root | Root 类名 | Order |
| 内部 Entity | Root 内部管理的 Entity 列表 | [OrderLine] |
| Value Object | 本 Aggregate 使用的 VO 列表 | [Money, Address, OrderId] |
| 不属于本 Aggregate | 明确排除的概念（至少 2 项） | [Payment, Logistics, PointsAccount] |

#### 不变量（Invariants）

Aggregate 内任何操作执行后都必须满足的条件。

| 字段 | 说明 | 示例 |
|------|------|------|
| 不变量描述 | 自然语言 + 形式化表达 | lines 非空时：total_amount == sum(line.price * line.quantity) |
| 涉及字段 | 哪些字段参与这条不变量 | total_amount, lines[].price, lines[].quantity |

#### 方法契约

Aggregate Root 的每个业务方法必须定义完整契约。

| 字段 | 说明 | 示例 |
|------|------|------|
| 方法名 | 动词命名 | place |
| 前置条件 | 调用前必须满足的条件 | status == DRAFT, lines 非空 |
| 操作 | 执行什么状态变更 | status → PLACED, 记录 placed_at |
| 后置条件 | 执行后保证什么 | status == PLACED, placed_at 非空 |
| 产生事件 | 产生的 Domain Event 名称和字段 | OrderPlaced(order_id, user_id, total_amount, placed_at) |
| 不做的事 | 该方法明确不负责的操作（至少 1 项） | 不扣库存、不创建支付单、不发通知 |
| 失败条件 | 什么情况下拒绝执行 + 报什么错 | status != DRAFT → raise DomainError("只有草稿状态可以下单") |

#### 不负责清单

该 Aggregate 整体不负责的事（比方法级更粗粒度）。

| 字段 | 说明 | 示例 |
|------|------|------|
| 不负责的职责 | 描述 | 支付收款 |
| 正确归属 | 应该由谁负责 | payment Context 的 Payment Aggregate |
| 协作方式 | 通过什么方式协作 | 本 Aggregate 发出 OrderPlaced 事件，Payment 监听处理 |

### 二、事件清单

所有 Domain Event 统一登记。

| 字段 | 说明 | 示例 |
|------|------|------|
| 事件名 | 过去式命名 | OrderPlaced |
| 触发方法 | 哪个 Aggregate 的哪个方法产生 | Order.place() |
| 字段列表 | 事件携带的所有字段和类型 | order_id: str, user_id: str, total_amount: float, placed_at: datetime |
| 消费方 | 哪些 Context/Aggregate 消费此事件 + 做什么 | inventory: Stock.reserve(); points: PointsAccount.earn() |
| 不应消费方 | 谁不应该监听此事件 + 为什么 | payment: 支付单由用户主动发起，不是自动创建 |

### 三、业务规则归属表

需求中的每条业务规则必须有且仅有一个归属位置。

| 字段 | 说明 | 示例 |
|------|------|------|
| 规则描述 | 自然语言描述业务规则 | 订单金额不能为负 |
| 规则来源 | 哪个需求/PRD 提出 | PRD-001 第 3 节 |
| 归属 Aggregate | 哪个 Aggregate 负责执行 | Order |
| 归属方法 | 哪个方法中校验/执行 | Order.add_line() |
| 校验时机 | 什么时候触发 | 每次添加商品行时校验 total 非负 |

### 四、增量需求影响评估（新增需求时必填）

当有增量需求进入时，在动手修改模型之前必须先填写此表。

| 字段 | 说明 |
|------|------|
| 需求描述 | 新需求一句话概述 |
| 路由判定结果 | 归属哪个 Context（引用路由规则） |
| 影响的 Aggregate | 列出所有受影响的 Aggregate |
| 变更类型 | 每个受影响 Aggregate 的变更类型：新增方法 / 修改方法 / 新建 Aggregate / 调整边界 |
| 新增事件 | 是否需要新的 Domain Event |
| 已有事件兼容性 | 是否需要修改已有事件的字段（如需要，是否向后兼容） |
| 不变量影响 | 已有不变量是否仍然成立 |
| 风险等级 | low（只加方法）/ medium（加 Aggregate/加事件）/ high（改边界/改不变量） |

---

## 评判规则

### 完备性检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-01 | 业务规则归属表中的每条规则都指向一个具体的 Aggregate + 方法 | "归属 Aggregate"或"归属方法"为空 → fail |
| TAC-02 | 每条业务规则只归属一个 Aggregate 的一个方法 | 同一条规则出现在多个 Aggregate 或多个方法中 → fail |
| TAC-03 | 每个 Aggregate 卡片的方法契约四项齐全 | 前置条件/后置条件/产生事件/不做的事 任一为空 → fail |
| TAC-04 | 每个 Aggregate 的不变量至少 1 条 | 不变量列表为空 → warning（极简 Aggregate 可以没有，但需确认） |
| TAC-05 | 事件清单中每个事件都有消费方 | "消费方"为空 → fail（没人消费的事件不应该产生） |

### Aggregate 边界检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-06 | Aggregate 内部成员数量合理 | 内部 Entity + Value Object 总数 >7 → warning（可能 Aggregate 太大） |
| TAC-07 | 不负责清单至少 2 项 | "不属于本 Aggregate"字段条目 <2 → fail |
| TAC-08 | 不负责清单与方法列表无矛盾 | 取"不负责清单"中的每项职责 → 检查方法列表中是否有方法在做该职责 → 有则 fail |
| TAC-09 | 不同 Aggregate 的职责无重叠 | 检查两个 Aggregate 的方法契约，是否有两个方法在做同一件事 → 有则 fail |
| TAC-10 | Entity 不跨 Aggregate 共享 | 同一个 Entity 出现在两个 Aggregate 的"内部 Entity"中 → fail |

### 方法契约检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-11 | 前置条件可从 Aggregate 自身字段判断 | 前置条件引用了 Aggregate 外部的状态（其他 Aggregate 的字段、外部 API 返回值）→ fail |
| TAC-12 | 后置条件与前置条件不矛盾 | 后置条件中的状态在前置条件约束下不可达 → fail |
| TAC-13 | "不做的事"有对应的"正确归属" | 方法的"不做的事"中的每项，在其他 Aggregate 的方法中能找到对应 → 找不到则 warning（可能遗漏了某个 Aggregate） |
| TAC-14 | 失败条件覆盖所有非法前置状态 | 前置条件定义了合法状态，失败条件应覆盖所有不满足前置条件的情况 → 未覆盖则 warning |
| TAC-15 | 产生的事件字段可从方法执行后的状态中获取 | 事件中某字段在 Aggregate 执行后无法获取其值 → fail |

### 事件完整性检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-16 | 每个事件的触发方法存在 | 事件的"触发方法"在对应 Aggregate 卡片中找不到 → fail |
| TAC-17 | 事件字段是基本类型或 VO | 事件字段类型是 Entity 或 Aggregate Root → fail |
| TAC-18 | 消费方的处理动作指向具体 Aggregate + 方法 | "消费方"列只写了 Context 名没写具体动作 → fail |
| TAC-19 | "不应消费方"有理由 | 列了不应消费方但没写为什么 → fail |
| TAC-20 | 无孤立事件 | 某个事件的消费方全部为空或全部是"不应消费方"→ fail |

### 不变量检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-21 | 不变量只涉及本 Aggregate 内部字段 | 不变量引用了其他 Aggregate 的字段 → fail |
| TAC-22 | 每条不变量至少有一个方法在维护它 | 不变量涉及的字段，没有任何方法会修改它们 → warning（可能不变量写错了，或方法遗漏了） |
| TAC-23 | 修改不变量涉及字段的方法，其后置条件能推导出不变量成立 | 方法修改了不变量字段但后置条件中未体现不变量约束 → fail |

### 业务规则归属检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-24 | 归属方法的前置条件或失败条件中体现了该规则 | 规则说"金额不能为负"，但对应方法的前置/失败条件中没有这个约束 → fail |
| TAC-25 | 规则的校验时机与方法的调用时机一致 | 规则说"下单时校验"，但归属方法是 cancel() → fail |

### 增量需求检查

| 规则编号 | 规则 | 判定方法 |
|---------|------|---------|
| TAC-26 | 增量需求有影响评估 | 新增需求但"增量需求影响评估"表未填写 → fail |
| TAC-27 | 变更类型为"调整边界"时风险等级必须为 high | 变更类型含"调整边界"但风险等级不是 high → fail |
| TAC-28 | 新增方法不破坏已有不变量 | 新方法的后置条件与已有不变量矛盾 → fail |
| TAC-29 | 修改已有事件字段时标注兼容性 | "已有事件兼容性"字段为空但变更涉及事件 → fail |
| TAC-30 | 新增 Aggregate 有完整卡片 | 变更类型为"新建 Aggregate"但没有对应的 Aggregate 卡片 → fail |

---

## 评判优先级

当规则之间冲突时，按以下优先级裁决：

1. **单一归属 > Aggregate 大小** — 宁可 Aggregate 稍大，也不要一条业务规则分散到两个 Aggregate
2. **不变量守恒 > 新功能实现** — 新需求不能破坏已有不变量，如果必须破坏，先修改不变量定义并评估影响
3. **边界稳定 > 编码便利** — 如果某个方法"放在这个 Aggregate 里写起来更方便但职责不属于它"，应该放到正确的 Aggregate 里即使需要多走一次事件
4. **明确拒绝 > 模糊包含** — "不做的事"比"做的事"更重要，每个方法必须明确不做什么
5. **前置条件严格 > 宽松** — 宁可拒绝不该处理的请求，也不要接受了再在中间环节报错

---

## Aggregate 卡片模板

建模 AI 产出文档时直接复制此模板填写：

```markdown
## Aggregate: {名称}

**所属 Context**: {context}
**Root**: {ClassName}
**内部 Entity**: [{Entity1}, {Entity2}]
**Value Object**: [{VO1}, {VO2}]
**不属于本 Aggregate**: [{排除1}, {排除2}]

### 不变量

| # | 描述 | 形式化 | 涉及字段 |
|---|------|--------|---------|
| 1 | {自然语言} | {表达式} | {字段列表} |

### 方法契约

#### {method_name}({params})
- **前置条件**: {条件列表}
- **操作**: {状态变更描述}
- **后置条件**: {条件列表}
- **产生事件**: {EventName}({字段列表})
- **不做的事**: {列表}
- **失败条件**: {条件} → raise {ErrorType}("{信息}")

### 不负责清单

| 职责 | 正确归属 | 协作方式 |
|------|---------|---------|
| {职责描述} | {哪个 Context 的哪个 Aggregate} | {事件/API/不需要协作} |
```
