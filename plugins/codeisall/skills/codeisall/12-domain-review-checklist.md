# 12 · 领域建模自查清单（Domain Review Checklist）

> **设计阶段（阶段 1-3）结束时**，主 Agent 用此清单自查；自查通过后启动 `domain-review` 复审。
> 关注的是**装饰器声明的合理性**，不关心 method body（那是 13-code-review-checklist.md）。

## 何时跑

```
战略层（manifest.py）→ 战术层（domain/*.py 装饰器骨架）→ 集成层（handlers）→ ★这里自查★
→ 通过 → domain-review 复审 → 通过 → 进入实现阶段
→ 不过 → 退回设计阶段迭代
```

## 自查清单

### A. 战略层（manifest.py）

```
□ 每个 Context 有 @bounded_context
□ type ∈ {core, supporting, generic}
□ type_rationale 不能是废话（"因为是核心"不行；要说明为什么是核心）
□ responsibility 精确描述做什么；必要时直接说明"不做什么"
□ 至少 3 个 @term（含 confusion 字段标明易混淆点）
□ 没有跨 ctx 的 import（lint cross-context-import）
```

### B. 聚合根

```
□ 每个聚合根至少 1 条 @invariant
  └─ lint aggregate-root-no-invariant
□ 每个聚合根至少 1 个 @command
  └─ lint aggregate-root-no-command
□ @invariant.fields 引用的属性都存在
  └─ lint invariant-field-not-exist
□ @invariant 方法名形如 _inv_xxx（惯例）
□ @invariant 描述用业务语言（不是代码逻辑）
□ @command 必须有完整 4 字段：emits / pre / post / fails
  （emits='无' 表示不发事件，pre/post/fails 仍不能省）
□ 业务上"显然不能违反"的规则都声明了不变量（不要漏）
```

### C. 值对象

```
□ @value_object 类有 @dataclass(frozen=True)
□ @vo_constraint 描述清晰、可执行（不要写"valid format"这种废话）
□ 修改操作必须返回新实例（不修改 self）
```

### D. 领域服务

```
□ @domain_service 必须跨 ≥2 个聚合（operates_on）
  └─ lint domain-service-must-cross-aggregates
□ 服务名不带技术后缀（Manager/Helper/Util/Handler）
  └─ lint domain-service-name-not-tech
□ description 用业务语言说明协调什么
□ 同 ctx 内跨聚合才用 domain_service；跨 ctx 用 event_handler
```

### E. 业务规则（@business_rule）

```
□ involves: list[str] 长度 ≥ 2
  └─ lint business-rule-must-cross-aggregates
□ 装饰位置必须是 @event_handler 函数 或 @domain_service 方法
  └─ lint business-rule-must-attach-to-handler-or-service
□ 没有独立的 business_rules.py + class XxxRule: pass 模式
□ source / timing 字段不为空、不是 TODO
□ 多步 saga 用同一 id 关联，steps 字段列出事件链
□ 单聚合规则归 @invariant（不要塞到 @business_rule）
```

### F. 事件与集成

```
□ 每个发布的事件都有消费者 或 显式 @non_consumer_of
  └─ lint event-no-consumer
□ 跨 ctx 通信全部用 @event_handler（不直接 import）
□ @event_handler 字段完整：event / from_context / relation_type / integration / label / failure_strategy
□ failure_strategy 是真实策略（不是 TODO / 占位符）
□ relation_type 正确：customer-supplier / conformist / anticorruption-layer 等
□ integration 正确：event / api / shared-db
```

## 建模质量盲点（lint 查不到的）

```
□ 聚合边界划分合理：会不会把本该独立的两个聚合塞一起？
□ 不变量遗漏：业务上"绝对不能违反"的事都声明了吗？
□ 责任归属：这条规则真的应该在这个聚合上吗？
□ 一致性策略：跨聚合规则用对了 @business_rule 吗？没有强行同事务？
□ 术语精确：@term 是不是写得太笼统？confusion 字段说清易混点了吗？
□ 状态机完整：聚合的状态机是否覆盖所有合法转换？是否禁止了非法回退？
```

## 自查报告模板

```markdown
## 领域建模自查报告

### Lint（领域相关）
- errors: 0
- warnings: 2

### 清单核对
- A 战略层：✓ 4 个 ctx，type_rationale 都不是废话
- B 聚合根：✓ 5 个，平均 3.4 不变量 / 2.8 命令
- C 值对象：✓ 全部 frozen
- D 领域服务：✓ 2 个，都跨 ≥2 聚合
- E 业务规则：✓ 1 条，装在 @event_handler 上
- F 事件流：✓ 所有事件有消费者或显式声明

### 建模质量
- ✓ 聚合边界清晰
- ✓ 不变量充分（订单、支付各 4 条以上）
- ✓ 业务规则归属正确

可以启动 domain-review 做独立复审。
```

## 跟 domain-review 的关系

| | 主 Agent 自查 | domain-review 复审 |
|---|---|---|
| 谁跑 | 主 Agent 自己 | 独立 forked skill（Explore，只读） |
| 视角 | "我有没有漏" | "做的对不对" |
| 必须跑 | ✅ 每次设计阶段结束 | ✅ 自查通过后 |
| 跳过 | ❌ 跳过 = 违规 | ❌ 跳过 = 违规 |

**两次都过 = 设计阶段真正完成，可以进入实现。**

## 跟下游 13-code-review-checklist.md 的关系

```
你（12）= 装饰器声明对不对（设计阶段产物）
13      = 代码实现做对了吗（实现阶段产物）

时序：你先 → 通过 → 13 后
```
