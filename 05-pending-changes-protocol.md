# 05 · pending-changes 协议

> 待修改清单是 codeisall 的核心交互通道。本文件定义 node_id 的命名规则、change_type 语义、字段约束。

## 完整字段定义

```typescript
type PendingChange = {
  node_id: string;          // 必填，看板节点标识
  change_type: ChangeType;  // 必填
  reason: string;           // 必填，一句话说明改什么
  prompt_hint?: string;     // 可选，给后续执行步骤的提示
  source_location?: {       // 可选（但建议带），精确定位文件行号
    file: string;           // 相对于项目根的路径
    line: number;
  };
};

type ChangeType = "add" | "modify" | "remove" | "conflict";
```

## node_id 命名规则

**必须严格遵守**，看板上 node_id ↔ 视图节点是 1:1 对应。

| 节点类型 | node_id 格式 | 示例 |
|---------|-------------|------|
| Context 框 | `ctx-bg-{ctx_id}` | `ctx-bg-order` |
| 聚合根 | `{ctx_id}__{ClassName}` | `order__Order` |
| 实体 | `{ctx_id}__{ClassName}` | `order__OrderLine` |
| 值对象 | `{ctx_id}__{ClassName}` | `order__Money` |
| 领域服务 | `{ctx_id}__svc__{ClassName}` | `order__svc__PricingService` |
| 空 Context 占位 | `{ctx_id}__empty_placeholder` | `weekly_report__empty_placeholder` |

**注意**：
- 是双下划线 `__`，不是单下划线
- `ctx_id` 不带 `_ctx` 后缀（用 `order` 不是 `order_ctx`）
- ClassName 是装饰器装饰的类的原始名（区分大小写）

## change_type 语义

### `add` — 新增节点

**语义**：当前模型还没有这个节点，需要新写装饰器代码引入。

**典型场景**：
- 加新的聚合根
- 加新的值对象 / 实体
- 加新的领域服务
- 加新的 Context（这时 node_id 是 `ctx-bg-{new_id}`，但要先确认目录约定）

**source_location 处理**：
- 如果是加到现有文件 → 指向目标文件 + 建议行号
- 如果是创建新文件 → file 写目标路径，line 写 1（或省略）

```json
{
  "node_id": "order__MemberLevel",
  "change_type": "add",
  "reason": "新增会员等级值对象，用于定价折扣",
  "prompt_hint": "创建 order_ctx/domain/value_objects.py 中追加 MemberLevel 类",
  "source_location": { "file": "order_ctx/domain/value_objects.py", "line": 40 }
}
```

### `modify` — 修改节点

**语义**：节点已存在，但装饰器参数 / 不变量 / 命令契约 / 字段需要变化。

**典型场景**：
- 加 / 改 / 删一条 @invariant
- 修改 @command 的 pre/post/emits/fails
- 改 ubiquitous_language 里某术语的 definition
- 给聚合根加属性

**source_location 必须带**，指向具体要修改的装饰器行。

```json
{
  "node_id": "order__Order",
  "change_type": "modify",
  "reason": "加新不变量：库存不足时拒单",
  "prompt_hint": "在 Order 类已有 @invariant 之后追加：库存不足拒单",
  "source_location": { "file": "order_ctx/domain/order.py", "line": 30 }
}
```

### `remove` — 删除节点

**语义**：把这个节点从代码里删除。

**典型场景**：
- 聚合根迁移到另一个 ctx
- 命令废弃
- 旧的事件 handler 不再消费

**风险检查**：删除前必须扫描引用，否则会留下 dangling reference。lint 会捕获大部分，但提前确认更稳妥。

```json
{
  "node_id": "payment__Payment.refund",
  "change_type": "remove",
  "reason": "refund 命令将迁移到新的 Refund 聚合根",
  "prompt_hint": "1. 确认无其他 handler 监听 PaymentRefunded（已 grep）  2. 删除 @command refund 装饰器和方法  3. 同步删除 events.published 中的 PaymentRefunded（如果只此一处发布）",
  "source_location": { "file": "payment_ctx/domain/payment.py", "line": 64 }
}
```

> 注意：本协议主要标节点级（聚合根 / 实体 / VO / 服务 / Context）。命令 / 不变量级别的变更通常归到所属聚合根的 modify 项，在 prompt_hint 里描述细节。

### `conflict` — 边界冲突 / 待澄清

**语义**：当前分析发现存在两难选择 / 边界模糊 / 需求互斥，**不直接改代码**，等待用户介入。

**典型场景**：
- 同一个责任两个聚合都想要
- 同一个术语在两个 Context 里定义不同
- 新需求与现有不变量冲突
- 实现细节有多种合理路径，需要用户决策

```json
{
  "node_id": "ctx-bg-points",
  "change_type": "conflict",
  "reason": "积分扣减时机与订单退款事件可能竞争，需要明确：是退款立刻扣回还是异步对账？两种方案对积分聚合的事件订阅模式影响不同。"
}
```

**conflict 不需要 source_location**（因为还没决定改在哪）。处理流程：
1. 输出 conflict 给用户
2. 跟用户讨论决策
3. 决策完成后，用 PATCH 把这个 conflict 替换成具体的 add/modify/remove

## reason / prompt_hint 写作规范

### reason（必填）

- **一句话**，给人看的，必须能脱离上下文理解
- 用业务语言，不用代码 / 装饰器名
- 长度建议 15-50 字

✅ 好：`"新增会员等级值对象，用于定价折扣"`
✅ 好：`"加不变量：周报提交后内容不可修改"`
❌ 差：`"add field"`
❌ 差：`"refactor"`
❌ 差：`"在 line 30 加 @invariant"`（这是 prompt_hint 的内容，不是 reason）

### prompt_hint（可选但强烈建议）

- **给执行步骤的精确指令**，可以用代码 / 装饰器名
- 通常包含：在哪里 / 做什么 / 注意什么
- 长度无限制，但 5 行内为佳

✅ 好：`"在 order_ctx/domain/order.py:30 给 Order 类追加：@invariant(description='下单时库存必须充足', fields=['items'])"`
✅ 好：`"创建新文件 order_ctx/domain/services/pricing_service.py，含 @domain_service + 1 个方法 calculate_final_price(order, promotions)"`

## API 用法

### 全量替换（推荐：分析完一次性写）

```bash
curl -X PUT http://localhost:8502/api/pending-changes \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}'
```

适用：完成一次完整分析后，把所有 pending 一次性提交。

### 增量合并（同步演进时用）

```bash
curl -X PATCH http://localhost:8502/api/pending-changes \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}'
```

按 node_id 合并：同 id 覆盖，新 id 追加。适用：发现遗漏，补充几条。

### 清空（验证完成后）

```bash
curl -X DELETE http://localhost:8502/api/pending-changes
```

适用：所有改动完成、lint 通过、用户确认后。

### 单条移除（部分完成时）

当前 API 没有单条 DELETE，方式：

```bash
# 1. GET 拉当前清单
# 2. 客户端过滤掉已完成项
# 3. PUT 写回剩余项
curl -s http://localhost:8502/api/pending-changes | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
remaining = [it for it in data['items'] if it['node_id'] != 'order__Order']
print(json.dumps({'items': remaining}))
" | curl -X PUT http://localhost:8502/api/pending-changes -H "Content-Type: application/json" -d @-
```

## 验证清单

每次 PUT 后回读：

```bash
curl -s http://localhost:8502/api/pending-changes | python3 -m json.tool
```

检查：
- [ ] items 数组长度跟你提交的一致
- [ ] 每个 node_id 都符合命名规则
- [ ] 每条 reason 不为空
- [ ] 标记完成后看板（前端）3 秒内自动高亮

## 常见错误

| 错误 | 表现 | 原因 |
|------|------|------|
| node_id 单下划线 | 看板不高亮 | 必须用 `__` 双下划线 |
| ctx_id 带 _ctx 后缀 | 看板不高亮 | 用 `order`，不是 `order_ctx` |
| change_type 拼错（如 update） | 前端不知道用什么颜色 | 严格用 `add / modify / remove / conflict` |
| reason 留空 | 用户看不懂 | 必填字段，不要省 |
| source_location.file 写绝对路径 | Claude 无法定位 | 必须是相对路径（相对 EXAMPLE_DIR） |
