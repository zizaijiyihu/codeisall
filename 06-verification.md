# 06 · 验证闭环

> 任何代码改动后必须执行的验证流程。**未通过验证就告诉用户"完成"是违规行为**。

## 三大验证维度

```
[ 改完代码 ]
      │
      ├─→ 1. 模型验证（/api/model）   "改对了吗？"
      ├─→ 2. lint 验证（/api/lint）   "合规吗？"
      └─→ 3. 引用验证（grep）         "有没有漏掉的依赖？"
      │
      ↓
   全部通过 → 清 pending → 报告用户
   有任一不过 → 回滚或继续改 → 再验证
```

## 验证 1：模型对照

### 目的

确认你以为改了的东西，看板真的反映了。

### 方法

```bash
# 改之前先抓一份快照
curl -s http://localhost:8502/api/model > /tmp/model_before.json

# 改完后再抓一份
curl -s http://localhost:8502/api/model > /tmp/model_after.json

# 对比关键节点
python3 <<'EOF'
import json
with open('/tmp/model_before.json') as f: before = json.load(f)
with open('/tmp/model_after.json') as f: after = json.load(f)

# 找 order 的 Order 聚合
def find_root(model, ctx_id, root_name):
    for c in model['contexts']:
        if c['id'] == ctx_id:
            for a in c['aggregates']:
                if a.get('root') and a['root']['name'] == root_name:
                    return a
    return None

b = find_root(before, 'order', 'Order')
a = find_root(after, 'order', 'Order')

print(f"invariants: {len(b['invariants'])} → {len(a['invariants'])}")
print(f"methods:    {len(b['methods'])}   → {len(a['methods'])}")
print(f"attributes: {len(b['root']['attributes'])} → {len(a['root']['attributes'])}")

# 列新增的 invariant
b_descs = {i['description'] for i in b['invariants']}
new_invs = [i for i in a['invariants'] if i['description'] not in b_descs]
for inv in new_invs:
    print(f"+ invariant: {inv['description']}")
EOF
```

### 期望

每条 pending change 都能在 model 里找到对应变化：
- `add` → 节点出现
- `modify` → 字段变化
- `remove` → 节点消失

**找不到对应变化 = 改没生效或改错地方**。回去检查文件 / 装饰器参数是否字面量。

### 常见失败

| 现象 | 原因 |
|------|------|
| 改了文件但 model 没变 | 装饰器参数不是字面量，AST 静默丢弃 |
| model 里出现了重复节点 | 装饰器被装了两次（或同名类装在两个地方） |
| 关系 (relations) 没更新 | event_handler 文件可能在错误的目录（必须 `application/handlers/`） |

## 验证 2：lint 通过

### 目的

确认改动不违反 DDD 铁律（依赖方向、跨 Context、不变量字段等）。

### 方法

```bash
curl -s http://localhost:8502/api/lint | python3 -m json.tool
```

或简洁版：

```bash
curl -s http://localhost:8502/api/lint | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d['summary']
print(f\"errors: {s['errors']}, warnings: {s['warnings']}\")
for diag in d['diagnostics']:
    if diag['severity'] == 'ERROR':
        print(f\"  ❌ {diag['rule_id']}: {diag['message']}\")
"
```

### 期望

- **`errors: 0`** 是硬指标
- `warnings` 单独评估 —— 设计阶段经常有合理 warning（如新事件还没消费者）

### 当前规则清单（来自 `ddd-python/README.md`）

| 规则 ID | 严重度 | 触发时检查 |
|---------|-------|----------|
| `business-rule-no-owner` | ERROR | `@business_rule(aggregate=X)` 引用了不存在的聚合根 |
| `aggregate-root-no-invariant` | WARN | 聚合根 0 条不变量（贫血预警） |
| `aggregate-root-no-command` | WARN | 聚合根 0 个 @command（贫血预警） |
| `invariant-field-not-exist` | ERROR | `fields=[...]` 引用了不存在的属性 |
| `event-no-consumer` | WARN | 事件被发布但无消费者且无 @non_consumer_of |
| `cross-context-import` | ERROR | 跨 Context 直接 import |
| `shared-reverse-import` | ERROR | shared/ 反向 import 业务 Context |
| `routing-keyword-conflict` | ERROR | 同关键词被多个 Context 声明 belongs |
| `domain-service-must-cross-aggregates` | ERROR | @domain_service operates_on < 2 |
| `domain-service-name-not-tech` | ERROR | 服务名含 Manager/Helper/Util |
| `domain-service-stateless` | ERROR | @domain_service 类有 @dataclass 字段 |

### 处理 warning

不要一律忽略。判断标准：

- **新增**事件还没消费者 → 合理 warning，记录在改动报告中提示用户
- **修改后**贫血聚合（少 invariant / command）→ 不合理 warning，要回去补
- **新增**业务规则未覆盖 → 提示用户补充 source

## 验证 3：引用扫描（修改 / 删除前后）

### 目的

确认改动没留下 dangling reference。

### 修改前：扫描影响范围

修改 / 删除某个聚合根 / 命令 / 事件之前：

```bash
# 找所有提到 Order 的装饰器
grep -rn "\"Order\"\|'Order'" /path/to/project --include="*.py" | grep -E "@(business_rule|event_handler|invariant)"

# 找所有 event_handler 消费 OrderPlaced
grep -rn "OrderPlaced" /path/to/project/*/application/handlers/

# 找所有发布 OrderPlaced
grep -rn "publish.*OrderPlaced" /path/to/project/*/domain/
```

### 修改后：再次扫描

```bash
# 删除节点后，确保没有引用残留
grep -rn "Order" /path/to/project --include="*.py" | grep -v "OrderLine\|...其他无关词"
```

### 期望

所有引用都已经同步更新。lint 应该捕获大部分（`business-rule-no-owner` 等），但 grep 是兜底。

## 完整验证流程

按 `04-incremental-change.md` 第 5 步，完整执行：

```bash
#!/bin/bash
# 改动验证脚本（可粘贴执行）

# 1. 模型快照对比（需要提前抓 before）
DIFF=$(diff /tmp/model_before.json <(curl -s http://localhost:8502/api/model) | wc -l)
echo "model diff lines: $DIFF"  # >0 表示有变化

# 2. lint
LINT_RESULT=$(curl -s http://localhost:8502/api/lint)
ERRORS=$(echo "$LINT_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['summary']['errors'])")
WARNINGS=$(echo "$LINT_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['summary']['warnings'])")
echo "lint: errors=$ERRORS warnings=$WARNINGS"

# 3. 引用扫描（按改动节点定制）
# grep ...

# 4. 全过 → 清 pending
if [ "$ERRORS" -eq "0" ]; then
    curl -X DELETE http://localhost:8502/api/pending-changes
    echo "✓ 全部通过，已清空 pending"
else
    echo "✗ lint 有 errors，未清空 pending"
fi
```

## 验证报告模板

给用户的最终报告应该包含：

```markdown
## 改动验证报告

### 模型对照
- ✓ `order__Order` 新增 1 条 invariant：「下单时商品库存必须充足」
- ✓ `order__svc__PricingService` 新增 1 个 method：`apply_member_discount`
- ✓ `ctx-bg-order` 新增 1 个 entity：`MemberLevel`

### Lint 检查
- errors: 0
- warnings: 2
  - `event-no-consumer`: `MemberLevelChanged` 暂无消费者（设计预留，下阶段补 handler）
  - `aggregate-root-no-invariant`: `MemberLevel` 0 条不变量（值对象不需要，可忽略）

### 引用扫描
- grep 确认 `business_rules.py` 中已同步更新 aggregate 引用
- 无 dangling reference

### 后续建议
- 实现阶段记得补 MemberLevelChanged handler
- 数据迁移：旧订单需要补 default member_level

pending-changes 已清空。可以进入下一轮迭代或停止。
```

## 反例：违反验证铁律

### ❌ 反例 1：lint 没跑就报"完成"

```
Claude:【Edit 完】"改完了 ✓"
用户:【看板还有红标】"lint 跑了吗？"
```

### ❌ 反例 2：model 没对照就报"完成"

```
Claude:【Edit 完，lint 0 errors】"改完了 ✓"
用户:【看板上节点还是原样】"看板没更新？"
原因：装饰器参数用了变量，AST 静默丢弃，lint 也没报
```

### ❌ 反例 3：pending 没清就转下一轮

```
用户:"再加个 X"
Claude:【没清旧 pending，又 PUT 新的，污染历史】
```

正确做法：每完成一轮 → DELETE 旧 pending → 再 PUT 新 pending。
