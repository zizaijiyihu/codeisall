# 13 · 代码实现自查清单（Code Review Checklist）

> **实现阶段（阶段 4-5）结束时**，主 Agent 用此清单自查；自查通过后启动 `code-review` 复审。
> 关注的是**代码实现的正确性**，不重复审装饰器（那是 12-domain-review-checklist.md）。

## 何时跑

```
domain-review ✓ → 实现 body + 写 infra + 写测试 → ★这里自查★
→ 通过 → code-review 复审 → 通过 → 告诉用户"完成"
```

## 前置条件

**domain-review 已通过**。如果有未解决的领域建模问题，跑这个清单没意义。

## 自查清单

### G. 六边形依赖方向

```
□ domain/ 不 import 第三方库（只允许标准库白名单 + ddd + 同 ctx 内的相对 import + shared）
  └─ lint domain-no-third-party-import
□ domain/ 不 import infrastructure / interface / application
  └─ lint domain-no-infra-import
□ application/ 不直接 import infrastructure 具体类（应通过接口）
  └─ lint application-no-infra-concrete
□ shared/ 不反向 import 业务 ctx
  └─ lint shared-reverse-import
□ agents/ 不 import 任何 _ctx（通过 HTTP/tool 交互）
  └─ lint agent-no-domain-import
□ @domain_service 无状态（不带 dataclass 字段）
  └─ lint domain-service-stateless
□ @query_handler / @view_model 不出现在 domain/ 层
  └─ lint query-not-in-domain
□ application/queries/ 不 import domain 聚合根（query 走 read model）
□ @query_handler.returns 必须对应一个 @view_model
  └─ lint query-handler-needs-view-model
```

### H. 实现完整性

```
□ domain 层每个 @command 的 body 已填充（不能全 pass）
□ method body 真的兑现了 pre/post/fails 契约：
  - 装饰器 pre="status==draft" → body 开头有 if self.status != 'draft': raise
  - 装饰器 post="status变为 submitted" → body 设置 self.status = 'submitted'
  - 装饰器 emits="X" → body 有 self._events.append(X(...))
  - 装饰器 fails="EmptyReport" → body 在对应条件下 raise EmptyReport
□ 装饰器声明的 fields 在 body 里真的被读/写（声明了但 body 没用 = 假声明）
□ domain 层定义了 Repository 接口（abc）
□ application 层有 Handler 编排（获取依赖 → 调聚合 → 持久化 → 发事件）
□ infrastructure 层实现了 Repository / Publisher
□ interface 层暴露了 HTTP / CLI 接口（如果项目需要）
```

### I. 知识覆盖（测试）

```
□ 每条 @invariant 都有对应 @verifies 测试
□ 每个 @command 的 pre/post/emits/fails 都有 @verifies_command 测试
  - 不只测 happy path（pre/post），也要测异常路径（fails）
□ 每个 @query_handler 的 visibility / filter / shape 都有 @verifies_query 测试
 sibility 是 query 的核心规则，必须有反例测试（无权限访问应被拒绝）
□ 测试有真实断言（不是 assert True 凑数）
□ pytest 全过（0 failures）
□ 看板"知识地图"无 ⚠️ 未覆盖标记
```

### J. Agent（如果有）

```
□ agents/ 目录独立于六边形
□ @agent + @agent_tool + @agent_constraint 字段齐全
□ tools.py 通过 HTTP 调 interface 层，不直接 import domain
□ Coding Agent 有 @agent_skill 和 @agent_cli 字段
```

### 跨 ctx 实现质量（K）

```
□ 跨 ctx event handler 内做了 ACL 翻译（不直接用上游 payload 格式）
□ 每个 handler 是幂等的（重复消费不出错）
□ failure_strategy 字段是真实策略（不是 TODO / 占位符）
□ 多步业务规则有 saga_id 跟踪（如果是 saga）
□ 补偿事件已实现（如果业务允许部分失败）
```

## 实现质量盲点（lint 查不到的）

```
□ body 没暗中"作弊"：lint 检查不到 method 内部行为
  例：声明 @command(emits="X") 但 body 里 import 了 sqlalchemy 发 SQL —— 不算 emit X
□ ACL 翻译是不是真的做了
  例：handler 直接 payload['fetched_tasks']['origin']['source'] —— 这就是没翻译
□ failure_strategy 写了 "重试" 但代码没有重试逻辑
□ Repository 实现是不是真的兑现接口（不只是 raise NotImplementedError）
□ 测试有没有 mock 掉关键校验（假覆盖）
```

## 自查报告模板

```markdown
## 代码实现自查报告

### Lint
- errors: 0
- warnings: 2

### 测试
- passed: 32 / 32
- failed: 0

### 知识覆盖率
- @invariant: 8/8 ✓
- @command pre: 12/12 ✓
- @command post: 12/12 ✓
- @command fails: 10/12 ⚠️（PointsAccount.deduct.fails 缺测试）

### 清单核对
- G 六边形：✓ 无违反 import
- H 实现完整性：✓ body 兑现契约
- I 知识覆盖：⚠️ 2 个测试缺，去补
- J Agent：N/A（本项目无 Agent）
- K 跨 ctx 实现：✓ ACL 翻译完整

待修复后再启viewer。
```

## 跟 code-review 的关系

| | 主 Agent 自查 | code-review 复审 |
|---|---|---|
| 谁跑 | 主 Agent 自己 | 独立 forked skill（Explore，只读） |
| 视角 | "我有没有漏" | "做的对不对" |
| 跳过 | ❌ 违规 | ❌ 违规 |

**两次都过 = 实现阶段真正完成，可以告诉用户"完成"。**
