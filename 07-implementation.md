# 07 · 实现阶段流程

> 触发：设计阶段全部完成（战略 + 战术 + 集成 + 用户确认），用户说"开始实现 / 写代码 / 填充逻辑"。
> 前置条件：看板已能完整展示全部 Context / 聚合 / 不变量 / 命令 / 事件边，lint 0 errors。

## 阶段门禁检查（进入前必须确认）

- [ ] 所有 Context 的 manifest.py 已写且看板渲染正确
- [ ] 所有聚合根有 ≥1 @invariant + ≥1 @command
- [ ] 跨 ctx 事件有对应 @event_handler
- [ ] `GET /api/lint` 0 errors
- [ ] 用户明确确认"设计完成，进入实现"

**任何一条不满足 → 退回设计阶段继续迭代。**

## 核心原则

1. **装饰器不动** —— 实现阶段不修改任何 @command / @invariant / @aggregate_root 的参数。如果实现过程中发现设计有遗漏（比如漏了一个不变量），必须走增量改动流程（标红 → 审阅 → 改装饰器 → 验证），不能悄悄改。
2. **六边形架构（端口-适配器）** —— domain 层不依赖任何外部技术，infrastructure 实现 domain 定义的接口。
3. **由内向外实现** —— domain → application → infrastructure → interface。先保证核心逻辑正确，再接入外部。

## 实现顺序（推荐）

### Step 1：domain 层 — 填聚合根 method body

最先做。这一步只改 `domain/*.py`，不碰其他层。

```python
# 之前（设计阶段）
@command(emits="WeeklyReportSubmitted", pre="...", post="...", fails="...")
def submit(self, approver_id): pass

# 现在（实现阶段）
@command(emits="WeeklyReportSubmitted", pre="...", post="...", fails="...")
def submit(self, approver_id):
    if self.status != 'draft':
        raise NotEditable(f"当前状态 {self.status} 不可提交")
    if not self.task_snapshots and not self.highlights:
        raise EmptyReport("周报内容为空")
    self.approver_id = approver_id
    self.status = 'submitted'
    self.submitted_at = datetime.utcnow().isoformat()
    self.is_late = self._check_late()
    self._events.append(WeeklyReportSubmitted(id=self.id, author_id=self.author_id, week=self.week))
```

**约束**：
- method body 必须兑现 @command 装饰器声明的 pre/post/fails 契约
- domain 层不 import infrastructure 的具体类（只依赖 abc 接口）
- 事件 append 到 `self._events`，不直接发布

### Step 2：domain 层 — 定义 Repository 接口（Port）

```python
# domain/repository.py（新建）
from abc import ABC, abstractmethod

class WeeklyReportRepository(ABC):
    @abstractmethod
    def save(self, report: WeeklyReport) -> None: ...

    @abstractmethod
    def find_by_id(self, report_id: str) -> WeeklyReport | None: ...

    @abstractmethod
    def find_by_author_and_week(self, author_id: str, week: str) -> WeeklyReport | None: ...
```

**这是六边形架构的 Port**：domain 定义接口，infrastructure 实现。

### Step 3：application 层 — Command Handler

```python
# application/handlers/submit_report.py（新建）
class SubmitReportHandler:
    def __init__(self, repo: WeeklyReportRepository, org_service, publisher):
        self.repo = repo
        self.org_service = org_service  # ACL：查组织架构获取审批人
        self.publisher = publisher

    def handle(self, report_id: str, current_user_id: str):
        report = self.repo.find_by_id(report_id)
        if not report:
            raise ReportNotFound(report_id)
        approver_id = self.org_service.get_direct_manager(current_user_id)
        report.submit(approver_id)
        self.repo.save(report)
        self.publisher.publish_all(report._events)
```

**约束**：
- Handler 编排（获取依赖 → 调聚合方法 → 持久化 → 发事件），不写业务逻辑
- 依赖注入 Repository / Publisher 接口，不 import 具体实现类

### Step 4：infrastructure 层 — Adapter 实现

```python
# infrastructure/repository.py（新建）
class WeeklyReportRepositoryImpl(WeeklyReportRepository):
    def __init__(self, db):
        self.db = db

    def save(self, report):
        # SQL / ORM 操作
        ...

# infrastructure/publisher.py（新建）
class EventPublisher:
    def publish_all(self, events):
        for event in events:
            bus.publish(event.__class__.__name__, asdict(event))
```

### Step 5：interface 层 — HTTP 接口

```python
# interface/api.py（新建）
from fastapi import APIRouter

router = APIRouter(prefix="/weekly-report")

@router.post("/{report_id}/submit")
def submit_report(report_id: str, current_user: User = Depends(get_current_user)):
    handler = SubmitReportHandler(repo=get_repo(), org_service=get_org(), publisher=get_publisher())
    handler.handle(report_id, current_user.id)
    return {"status": "ok"}
```

### Step 6：测试

详见下方"测试策略"。

## 六边形架构层级约束

```
┌─────────────────────────────────────────────────────┐
│ interface/  (Driving Adapter: HTTP / CLI / 定时任务)  │
│   可以 import: application                           │
│   不可 import: domain 的具体类 / infrastructure      │
├─────────────────────────────────────────────────────┤
│ application/  (Use Case / Command Handler)           │
│   可以 import: domain（接口 + 聚合）                  │
│   不可 import: infrastructure 的具体类               │
├─────────────────────────────────────────────────────┤
│ domain/  (核心：聚合根 / Entity / VO / Port 接口)    │
│   不可 import: 任何其他层                            │
│   只依赖: dataclasses, typing, datetime, abc 等标准库│
├─────────────────────────────────────────────────────┤
│ infrastructure/  (Driven Adapter: DB / MQ / HTTP)    │
│   可以 import: domain（实现 Port 接口）              │
│   不可 import: application / interface               │
└─────────────────────────────────────────────────────┘
```

## Agent 与六边形的关系

### 核心认知

> **领域提供能力和规则，人或 Agent 都是 Actor —— 在规则约束下组合能力。领域层不区分操作者是谁。**

Agent 不是六边形的一层。它是独立于六边形的**自主 Actor**，跟人（前端 GUI）同级：

```
传统六边形：
  外部世界 → [驱动适配器] → Application → Domain ← [被驱动适配器] ← 外部系统

加了 Agent 后：
  人 → [GUI] ─┐
               ├→ interface → Application → Domain ← [Adapters] ← DB/MQ/LLM
  Agent ────── ┘
    ↑
    Agent 自己也可能调用 LLM/工具（这是 Agent 内部的事，领域不关心）
```

### Agent 为什么不属于六边形的任何一层

| 层 | 特点 | Agent 符合吗？ |
|----|------|---------------|
| interface | 薄壳，只做路由+序列化 | ❌ Agent 有策略、有推理、有自主决策 |
| application | 预定义用例，一个 handler 做一件事 | ❌ Agent 自主编排多个用例 |
| domain | 规则+能力，不可替换 | ❌ Agent 不产生规则，可被替换（换人工/换另一个 AI） |
| infrastructure | 被动工具，被调用 | ❌ Agent 有主动性，它调用别人 |

### 代码结构

```
your-project/
├── {ctx}_ctx/                      ← 六边形（领域系统）
│   ├── domain/                     │  能力 + 规则
│   ├── application/                │  用例编排
│   ├── infrastructure/             │  技术适配（DB/MQ/LLM API）
│   └── interface/                  │  暴露入口（HTTP API + Agent tool schema）
│
└── agents/                         ← Actor 区域（独立于六边形）
    └── {agent_name}/
        ├── agent.py                #  Agent 主体：自主编排策略
        ├── tools.py                #  工具注册（调 interface 层暴露的能力）
        └── prompts.py              #  Prompt 模板 / 系统指令
```

### interface 层暴露两种入口

```python
# interface/api.py — 给人用（HTTP）
@router.post("/reports/{id}/submit")
def submit_report(id, user): ...

# interface/agent_tools.py — 给 Agent 用（tool schema）
def tool_submit_report(report_id, as_user): ...
```

两者调用**同一套 application handler**，受**同一套 domain 规则**约束。

### Agent 内部可以自由使用任何技术

Agent 内部（`agents/` 目录）不受六边形依赖方向约束 —— 它是独立模块：
- 可以用 AgentScope / LangChain / CrewAI
- 可以调 LLM API
- 可以调外部数据源（邮件/日程/Git）
- 可以维护对话历史

这些都是 Agent 自己的事，领域系统不知道也不关心。领域系统只知道"有人调了 submit，参数合法，规则通过"。

### 关键约束

1. **agents/ 不 import domain 层** —— Agent 通过 interface 暴露的 tool 操作系统，不直接 import 聚合根
2. **domain/ 不 import agents/** —— 领域不知道 Agent 存在
3. **Agent 受同一套规则约束** —— 调 tool_submit_report 跟人调 HTTP submit 走一条路径，NotEditable / NotApprover 照样拒绝

## 测试策略（知识驱动测试）

### 核心原则

> **测试不是"验证代码正确"，是"为领域知识提供可执行证据"。**

测试用例通过 `@verifies` / `@verifies_command` 装饰器**显式声明**自己在验证哪条领域知识。
AST 抽取后看板展示"知识覆盖率" —— 每条不变量/命令有几个测试覆盖。

### 装饰器

```python
from ddd.decorators import verifies, verifies_command

@verifies(invariant="_inv_submitted_content_frozen", context="weekly_report", aggregate="WeeklyReport")
def test_edit_after_submit_raises():
    """验证：提交后内容不可修改"""
    report = WeeklyReport(..., status="submitted")
    with pytest.raises(NotEditable):
        report.update_draft(...)

@verifies_command(command="submit", aspect="fails", context="weekly_report", aggregate="WeeklyReport")
def test_submit_empty_raises():
    """验证：空内容不能提交"""
    report = WeeklyReport(..., task_snapshots=[], highlights="")
    with pytest.raises(EmptyReport):
        report.submit("mgr")
```

| 装饰器 | 验证什么 | 参数 |
|--------|---------|------|
| `@verifies` | 不变量 | invariant（方法名）, context, aggregate |
| `@verifies_command` | 命令契约 | command（方法名）, aspect（pre/post/emits/fails）, context, aggregate |

### 测试组织方式：按领域知识分组

```python
# ❌ 传统方式：按文件/模块分
class TestWeeklyReport:
    def test_submit(self): ...
    def test_review(self): ...

# ✅ codeisall 方式：按领域知识分
class TestInvSubmittedContentFrozen:
    """所有验证 _inv_submitted_content_frozen 的测试"""
    @verifies(invariant="_inv_submitted_content_frozen", ...)
    def test_edit_after_submit_raises(self): ...
    @verifies(invariant="_inv_submitted_content_frozen", ...)
    def test_edit_in_draft_ok(self): ...

class TestCommandSubmit:
    """所有验证 submit 命令的测试"""
    @verifies_command(command="submit", aspect="pre", ...)
    def test_submit_requires_draft(self): ...
    @verifies_command(command="submit", aspect="fails", ...)
    def test_submit_empty_raises(self): ...
```

### 看板展示：知识覆盖率

看板知识地图的"约束"和"行为契约"Tab 里，每条知识后标注：

```
⚠ 约束 Tab:
  提交后内容不可修改　✅ 2 tests
  状态机只能正向流转　✅ 3 tests
  一个员工每周只能一份周报　⚠️ 未覆盖

📋 行为契约 Tab:
  WeeklyReport.submit(approver_id)　✅ 4 tests
  WeeklyReport.archive()　✅ 3 tests
  FetchJob.start(...)　⚠️ 未覆盖
```

**人看这个就知道：哪些知识有证据支撑，哪些还没被验证。**

### 测试金字塔

```
        /\
       /  \    E2E（少量：接口层 → 全链路）
      /    \
     /------\   集成（适量：Handler + 真实 Adapter）
    /        \
   /----------\  单元 + @verifies（大量：每条领域知识的可执行证据）
  /____________\
```

### AI 生成测试的流程

AI（Claude / Coding Agent）负责：
1. 读 @invariant / @command 装饰器
2. 为每条知识生成测试骨架（含 @verifies 标注）
3. 填充测试 body（按 pre/post/fails 契约设计 case）
4. 跑 pytest 验证全过

人负责：
1. 看"知识覆盖率"—— 有 ⚠️ 未覆盖的就让 AI 补
2. 审阅测试的"知识关联是否正确"（@verifies 标的对不对）

### 覆盖率指标

| 指标 | 含义 | 目标 |
|------|------|------|
| 知识覆盖率 | 有 @verifies 关联的知识数 / 总知识数 | **100%**（每条不变量和命令都有测试） |
| 代码行覆盖率 | 传统 coverage.py | 参考（不作为门禁） |

**知识覆盖率 100% 是硬门禁。** 代码行覆盖率是参考指标 —— 行覆盖满但知识没覆盖 = 测试有量无质。

## 实现过程中发现设计遗漏怎么办？

**不要偷偷改装饰器**。走增量改动流程（`04-incremental-change.md`）：

1. 停下实现
2. 分析遗漏 → PUT /api/pending-changes 标红
3. 输出改动计划 → 等用户确认
4. 改装饰器 → 验证（model + lint）
5. 清 pending → 继续实现

这样做的好处：看板始终跟代码一致，不会出现"代码里有个不变量但看板上没显示"的幽灵状态。

## 完成检查清单（实现阶段结束前）

- [ ] domain 层所有 @command 方法 body 已填充，兑现了 pre/post/fails 契约
- [ ] domain 层定义了 Repository 接口（Port）
- [ ] application 层有 Handler 编排（获取 → 调聚合 → 持久化 → 发事件）
- [ ] infrastructure 层实现了 Repository / Publisher
- [ ] interface 层暴露了 HTTP / CLI 接口
- [ ] **知识覆盖率 100%**：每条 @invariant 和 @command 都有 @verifies 测试
- [ ] 测试全过（pytest 0 failures）
- [ ] 看板知识地图无 "⚠️ 未覆盖" 标记
- [ ] lint 仍 0 errors
- [ ] 装饰器没有被改动（如果改了，确认走了增量流程）
