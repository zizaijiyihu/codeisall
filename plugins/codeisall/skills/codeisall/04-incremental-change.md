# 04 · 增量改动流程

> 触发：用户在现有 DDD 代码库上提出 "加一个 XX" / "改一下 YY" / "把 ZZ 拆开" / "去掉 WW" 等需求。
> 目标：通过"标红 → 审阅 → 改 → 验证"四步，**让用户在改动落到代码之前看到范围**。

## 推荐节奏（从零开始时）

战略 manifest（全 ctx）一次性产出，之后**按 ctx 分阶段推进**，
每阶段完整跑通一个 ctx：装饰器骨架 → domain-review → 填 body + 测试 → code-review → 下一个 ctx。

**唯一原则：一次别贪多，单 ctx 闭环再下一个。**

不强制依赖顺序、不强制串行/并行、**不在看板上跟踪开发进度**（看板是知识视图，不是项目管理工具）。
回头改前置 ctx 是正常的，改完仍要让对应阶段的 reviewer 跑一遍 —— 但只针对改动相关的部分，不必整 ctx 重审。

下面讲的是"已有项目改东西"的增量协议，节奏更细。

---

## 四步铁律

```
[需求] → 1. 分析 → 2. 标红 → 3. 审阅 → 4. 改 → 5. 验证 → [完成]
                       │
                       ↓
              用户在看板上看到红/绿标
              确认范围对不对，没问题才放行
```

**任何一步都不能跳过**。特别是"标红"，它是用户监督 Claude 的核心机制。

## 第 1 步：分析（不写任何代码）

读取上下文：

```bash
# 拉当前模型
curl -s http://localhost:8502/api/model > /tmp/model.json

# 根据用户描述定位相关 Context 和聚合
# 读必要的代码文件（按 source_location 精确读取）
```

分析输出（结构化思考）：

| 项目 | 内容 |
|------|------|
| **需求本质** | 这个需求实际要改的是什么概念 / 行为？ |
| **影响范围** | 涉及哪些 Context / 聚合根 / 不变量 / 命令 / 事件 / 业务规则？ |
| **改动类型** | 每个受影响节点是 add / modify / remove / conflict？ |
| **风险点** | 是否跨 Context？是否会破坏现有不变量？是否需要数据迁移？ |

## 第 2 步：标红（写入 pending-changes）

把分析结果写到 `/api/pending-changes`：

```bash
curl -X PUT http://localhost:8502/api/pending-changes \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "node_id": "<节点 id>",
        "change_type": "add | modify | remove | conflict",
        "reason": "<一句话说明这里要改什么>",
        "prompt_hint": "<可选：给自己的提示词，描述具体改动>",
        "source_location": { "file": "...", "line": ... }
      },
      ...
    ]
  }'
```

node_id 命名规则见 `05-pending-changes-protocol.md`。

**写完 pending 后，看板会在 3 秒内自动高亮**。这是给用户看的入口。

## 第 3 步：审阅（输出改动计划文本）

**同步**把改动计划用自然语言输出给用户：

```markdown
## 改动计划：<需求一句话总结>

### 改动范围
- ✎ 修改：<节点1>（<reason>）
- ＋ 新增：<节点2>（<reason>）
- ✕ 删除：<节点3>（<reason>）

### 详细步骤
1. 在 `<file>:<line>` 给 `<class>` 加一个 `@invariant(...)`
2. 在 `<file>:<line>` 给 `<method>` 修改 `pre=...`
3. 创建新文件 `<file>` 含 `@aggregate_root(...)` ...

### 风险 / 注意
- 该改动会让现有的 X 不变量需要同步更新
- 如果用户已有数据，X 字段的旧值需要迁移
- 建议改完跑 lint 重点关注 Y 规则

请确认是否按此计划改动？
```

**等用户说"好"或"改一下 X"再进入下一步**。不要看到红标就直接动手 —— 用户可能在看板上发现你没考虑到的地方。

## 第 4 步：改（执行 Edit）

按 pending-changes 里的 `source_location` 精确定位：

```python
# 伪代码
for item in pending:
    if item.change_type == "add":
        # 创建新文件 或 在现有文件追加装饰器骨架
        Edit(file=..., old=..., new=...)
    elif item.change_type == "modify":
        # 定位到 source_location.line，修改装饰器参数 / body
        Read(file=item.source_location.file)
        Edit(...)
    elif item.change_type == "remove":
        # 删除类 / 方法 / 装饰器
        # 注意：先确认引用已迁移
        ...
    elif item.change_type == "conflict":
        # 不直接改 —— 跟用户讨论澄清后转成具体的 add/modify/remove
        ...
```

修改时必须遵守：

- 装饰器参数全部字面量
- 不修改 method 签名时同步检查 @command 的 pre/post 是否还成立
- 删除节点前用 grep 检查是否有引用

## 第 5 步：验证（codeisall 闭环）

改完所有文件后，**强制**做三件事：

### 5.1 验证模型变化

```bash
curl -s http://localhost:8502/api/model > /tmp/model_after.json
```

对照预期：
- 新增节点是否出现？
- 修改节点的字段是否变了？
- 删除节点是否消失？
- relations / events 是否同步更新？

### 5.2 跑 lint

```bash
curl -s http://localhost:8502/api/lint | python3 -c "import json,sys; d=json.load(sys.stdin); print('errors:', d['summary']['errors'], 'warnings:', d['summary']['warnings'])"
```

**0 errors 是硬指标**。warnings 单独看 —— 有时候新增逻辑会临时产生 orphan 警告（如新事件还没消费者），可以跟用户确认是否合理。

### 5.3 清空 pending-changes

```bash
curl -X DELETE http://localhost:8502/api/pending-changes
```

或者只清掉已完成的项目（用 PATCH 把剩余项目留下）。

### 5.4 输出验证报告给用户

```markdown
## 改动完成 ✓

### 验证结果
- /api/model：<列出新增 / 修改 / 删除的节点>
- /api/lint：0 errors, <N> warnings
  - warning 1: <如有需要进一步处理的，列出>
- 看板已更新（已清空 pending-changes）

### 后续建议（可选）
- 该改动涉及 X 事件，建议跑一次端到端测试
- Y 命令的 body 还是 pass，需要在下一阶段填实现
```

## 反例

### ❌ 反例 1：跳过标红直接改

```
用户："给 Order 加个 priority 字段"
Claude:【直接 Read + Edit + 跑 lint】"改完了"
用户:【没看到改动范围，不知道是否波及不变量、handler 等】
```

正确做法：先 PUT pending，然后输出"我要改这 N 处"，等用户确认再动。

### ❌ 反例 2：标红了但漏算依赖

```
Claude: 标红 order__Order
       【漏标了引用 Order 的 business_rule 和 跨 ctx event_handler】
用户:【看板只看到 Order 红标，以为只改一处】
       【改完发现 business_rule 还指向旧字段，lint 报错】
```

正确做法：**分析阶段要做引用扫描**，凡是引用了即将变动节点的地方都要标红。可以用：

```bash
# 找所有提到 Order 的装饰器
grep -rn "Order" /path/to/project --include="*.py" | grep -E "@(aggregate_root|business_rule|event_handler|invariant)"
```

### ❌ 反例 3：lint 没跑就告诉用户"好了"

```
Claude:【Edit 完】"完成"
用户:【刷新页面发现红标还在】"你跑 lint 了吗？"
```

正确做法：5.1-5.3 全跑过、报告全列出，再说"完成"。

## 改动复杂度分级

按改动跨度选择详细策略：

| 级别 | 描述 | 建议 |
|------|------|------|
| **L1 字段微调** | 改一条 @invariant 的描述、加一个属性 | 单步标红 + 改 + 验证 |
| **L2 命令调整** | 加 / 改 / 删一个 @command | 标红 root + 相关事件 + 业务规则 |
| **L3 聚合演化** | 拆 / 合并聚合根、加新聚合 | 标红涉及全部 ctx 内节点，分批执行 |
| **L4 Context 重组** | 拆 / 合并 Context、改集成方式 | 强烈建议先标 conflict，跟用户深度讨论再细化 |

L3/L4 应该走 `${CLAUDE_PLUGIN_ROOT}/skills/ddd-review/09-tactical-modeling.md` 的"增量需求评估"流程，先做影响分析报告再动手。
