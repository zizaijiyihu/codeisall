# 14 · 双 Reviewer 复审协议

> codeisall 有**两个** reviewer skill（带 `context: fork`，fork 进只读 Explore agent），分别在不同阶段复审。
> 装饰器层面（建模）和 method body 层面（实现）由不同 reviewer 把关。
> 两个 reviewer 都随 `codeisall` 插件安装，无需单独拷贝 subagent、无需重启会话。

## 两个 Reviewer 的分工

| | domain-review | code-review |
|---|---|---|
| **审什么** | 装饰器声明 / 领域建模合理性 | method body / 测试 / 依赖方向 |
| **何时跑** | 设计阶段（1-3）完成时 | 实现阶段（4-5）完成时 |
| **必须门禁** | 不过 → 不能进入实现阶段 | 不过 → 不能告诉用户"完成" |
| **依据清单** | 12-domain-review-checklist.md | 13-code-review-checklist.md |
| **不该看** | method body | 装饰器（除非验证 body 是否兑现契约） |
| **工具集** | Explore（只读，无 Edit/Write） | Explore（只读，无 Edit/Write） |

## 完整时序

```
阶段 1-3：写装饰器骨架（body=pass）
   ↓
主 Agent 自查（12-domain-review-checklist.md）
   ↓
启动 /codeisall:domain-review 复审（fork 进 Explore）
   ↓
 阶段 4-5：填 body + 写测试
   ↓
主 Agent 自查（13-code-review-checklist.md）
   ↓
启动 /codeisall:code-review 复审（fork 进 Explore）
   ↓
通过 → 告诉用户"完成"
```

**任一 reviewer 不过都不能进入下一阶段。**

## 启动方式

两个 reviewer 都是带 `context: fork, agent: Explore` 的 skill。主 Agent 调用 skill 名即可——skill 内容即 forked 子 agent 的审查任务，Explore 的只读工具集保证 reviewer 只标 pending-changes、不改代码（结构强制，无需靠自觉）。

### 启动 domain-review（设计阶段后）

调用 `/codeisall:domain-review`（或 Claude 依据其 description 在设计阶段门禁自动触发）。调用时可附带上下文：

```
项目路径：<project_path>
本次主 Agent 完成的设计：<ctx 数 / 聚合 / 不变量 / 业务规则>
自查结果：lint 0 errors / 12-domain-review-checklist 全过
请按 12-domain-review-checklist.md 独立审查。
```

### 启动 code-review（实现阶段后）

调用 `/codeisall:code-review`，附带：

```
项目路径：<project_path>
本次主 Agent 完成的实现：<body 填充 / 测试数 / handler 数>
前置：domain-review 已通过
自查结果：lint 0 errors / pytest 全过 / 13-code-review-checklist 全过
请按 13-code-review-checklist.md 独立审查。
```

> 不再需要"Task 工具 + subagent_type + 拷贝到 .claude/agents/ + 重启会话"那一套——skill 自带 fork 机制，装好插件即可用。

## 协作模式：pending-changes 通道

两个 reviewer 都写 `/api/pending-changes`，用 reason 前缀区分：

| Reviewer | reason 前缀 | 处理人 |
|---------|------------|--------|
| domain-review | `[领域] ...` | 主 Agent 改装饰器 |
| code-review | `[实现] ...` | 主 Agent 改 method body / 测试 |

## 迭代终止

| 迭代次数 | 处理 |
|---------|------|
| 1-3 轮 | 修复 → 再审 → 直到 0 问题 |
| > 3 轮 | 停止，输出"需要人工介入" |

**3 轮还修不完**，对 domain-review 通常意味着设计本身有问题，对 code-review 通常意味着实现方法不对。

## 何时跳过 reviewer

| 场景 | domain-review | code-review |
|------|----------------|---------------|
| 完整流程（设计 → 实现） | ✅ 必须 | ✅ 必须 |
| 只改装饰器（增量加 invariant） | ✅ 必须 | ⚠️ 建议 |
| 只改 body（修 bug） | ❌ 跳过 | ✅ 必须 |
| 重构（动多文件） | ✅ 必须 | ✅ 必须 |
| 微小改动（typo） | ❌ 跳过 | ❌ 跳过 |
| 用户明确说"先跑起来" | ❌ 跳过（记日志） | ❌ 跳过（记日志） |

## 反例

| ❌ 反模式 | 后果 |
|---------|------|
| 跳过 domain-review 直接进实现 | 实现到一半发现建模有问题 → 大返工 |
| 主 Agent 自己审 = 复审 | 视角不独立，盲点查不到 |
| 一个 reviewer 同时审建模 + 实现 | 视角混乱，标准不清（上一版的问题） |

## 一句话总结

> **domain-review = 设计门禁**：装饰器没过 → 不能进入实现
> **code-review = 实现门禁**：代码没过 → 不能告诉用户"完成"
> 两个 reviewer 都是 forked skill（Explore 只读），互不重叠、各司其职、依次把关。
