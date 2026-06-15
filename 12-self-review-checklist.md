# 12 · 结构性自查清单（Self-Review Checklist）

> 主 Agent 生成完代码后**必须**自检一遍，用这份清单逐项核对。
> 自检通过才能告诉用户"完成"。

## 核心原则

> **生成是第一遍，自查是第二遍。两遍都按 skill 走，才算交付。**

代码生成后，AI 切换到"审查者"视角，用同一份 skill 反向核对自己的产出。
发现问题不算失败 —— 发现并修复才叫完整流程。**没发现问题但其实有 = 灾难。**

## 自查清单（按知识层次组织）

### A. 战略层（manifest.py）

```
□ 每个 Context 有 @bounded_context 且 type 取值合法（core/supporting/generic）
□ type_rationale 写明为什么是这个类型（不能空）
□ responsibility 是一句话能讲清的职责
□ 每个 ctx 至少 3 个 @term（含 confusion 字段）
□ 没有跨 ctx 的 import（lint cross-context-import）
□ shared/ 没有反向 import 业务 ctx（lint shared-reverse-import）
```

### B. 战术层 — 聚合根

```
□ 每个聚合根至少 1 条 @invariant（不变量）
  └─ lint aggregate-root-no-invariant
□ 每个聚合根至少 1 个 @command（命令）
  └─ lint aggregate-root-no-command
□ @invariant.fields 引用的属性都存在
  └─ lint invariant-field-not-exist
□ @invariant 的方法名是 _inv_xxx（惯例）
□ @command 必须有完整 4 字段：emits / pre / post / fails
  （emits='无' 表示不发事件，但 pre/post/fails 不能省）
```

### C. 战术层 — 值对象

```
□ @value_object 类有 @dataclass(frozen=True)
□ 修改操作必须返回新实例（不修改 self）
□ @vo_constraint 描述清晰
```

### D. 战术层 — 领域服务

```
□ @domain_service 必须跨 ≥2 个聚合（operates_on）
  └─ lint domain-service-must-cross-aggregates
□ 服务名不带技术后缀（Manager/Helper/Util/Service 等）
  └─ lint domain-service-name-not-tech
□ 无状态（不能有 dataclass 字段）
  └─ lint domain-service-stateless
```

### E. 业务规则（@business_rule）

```
□ involves: list[str] 长度 ≥ 2
  └─ lint business-rule-must-cross-aggregates
□ 装饰位置必须是 @event_handler 函数 或 @domain_service 方法
  └─ lint business-rule-must-attach-to-handler-or-service
□ 没有独立的 business_rules.py 文件（空类 + 装饰器）
□ source / timing 字段不为空
□ 多步 saga 用同一 id 关联
```

### F. 事件与 ACL

```
□ 每个发布的事件都有消费者 或 显式 @non_consumer_of
  └─ lint event-no-consumer
□ 跨 ctx event_handler 内有 ACL 翻译（不直接用上游格式）
□ failure_strategy 字段写明（不能空 / TODO）
□ Handler 是否幂等
```

### G. 六边形依赖方向

```
□ domain/ 不 import 第三方库（只允许标准库白名单 + ddd + shared）
  └─ lint domain-no-third-party-import
□ domain/ 不 import infrastructure/interface/application
  └─ lint domain-no-infra-import
□ application/ 不直接 import infrastructure 具体类
  └─ lint application-no-infra-concrete
□ agents/ 不 import 任何 _ctx（通过 HTTP/tool 交互）
  └─ lint agent-no-domain-import
```

### H. 实现完整性

```
□ domain 层每个 @command 的 body 已填充（不能全 pass）
□ method body 兑现了 pre/post/fails 契约
□ domain 层定义了 Repository 接口（abc）
□ application 层有 Handler 编排
□ infrastructure 层实现了 Repository / Publisher
□ interface 层暴露了 HTTP API（如果项目需要）
```

### I. 知识覆盖（测试）

```
□ 每条 @invariant 都有对应 @verifies 测试
□ 每个 @command 的 pre/post/fails 都有 @verifies_command 测试
□ pytest 全过（0 failures）
□ 看板"知识地图"无 ⚠️ 未覆盖标记
```

### J. Agent（如果有）

```
□ agents/ 目录独立于六边形
□ @agent + @agent_tool + @agent_constraint 都齐全
□ tools.py 通过 HTTP 调 interface 层，不直接 import domain
□ Coding Agent 有 @agent_skill 和 @agent_cli
```

## 自查流程

```
1. lint 通过（codeisall-lint 跑 0 errors）
   ↓
2. 测试通过（pytest 0 failures）
   ↓
3. 知识覆盖（看板无 ⚠️）
   ↓
4. 逐项核对本清单 A-J
   ↓
5. 任意一项 ❌ → 修 → 回到第 1 步
   ↓
6. 全部 ✅ → 启动子 agent 复审（详见 13-review-subagent.md）
   ↓
7. 子 agent 也通过 → 告诉用户"完成"
```

## 自查报告模板

每次自查必须输出结构化报告：

```markdown
## 自查报告

### 通过项 ✅
- A 战略层：4 个 ctx，全部 type_rationale 完整
- B 聚合根：5 个，平均 3.4 不变量 / 2.6 命令
- ...

### 失败项 ❌
- E 业务规则：'下单送积分' 缺 source 字段
- I 知识覆盖：FetchJob.start(pre) 无 @verifies_command 测试

### 修复计划
1. 补 source="营销规则 v1.2"
2. 补 test_fetch_start_requires_no_active

### Lint 报告
errors: 0
warnings: 2

### 测试报告
24 passed, 0 failed
```

## 跟主 skill 流程的关系

```
铁律 5 说："装饰器 → 看板 → lint 三方一致"
铁律 6 说："实现阶段必须有测试"
铁律 7 说："声明性知识必须落到守护代码上"

这份自查清单 = 三条铁律的可执行检查项。
没跑这份清单 = 没遵守铁律。
```
