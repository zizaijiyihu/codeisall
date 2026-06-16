# 08 · Agent 架构与视图

> Agent 是独立于六边形的自主 Actor。领域提供能力和规则，Agent 在规则约束下组合能力。

## 核心认知

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

**领域提供能力和规则，人或 Agent 都是 Actor —— 在规则约束下组合能力。领域层不区分操作者是谁。**

## Agent 不属于六边形的任何一层

| 层 | 特点 | Agent 符合吗？ |
|----|------|---------------|
| interface | 薄壳，只做路由+序列化 | ❌ Agent 有策略、有推理、有自主决策 |
| application | 预定义用例，一个 handler 做一件事 | ❌ Agent 自主编排多个用例 |
| domain | 规则+能力，不可替换 | ❌ Agent 不产生规则，可被替换 |
| infrastructure | 被动工具，被调用 | ❌ Agent 有主动性，它调用别人 |

## 两类 Agent

| | Tool-use Agent | Coding Agent |
|---|---|---|
| 业界术语 | Function Calling / Tool Agent | SWE Agent / Code Agent |
| 代表框架 | AgentScope / LangChain / GPT Actions | OpenHands / Devin / Claude Code |
| 操作方式 | 调预定义 tool schema（粗粒度） | 读写文件 + 执行命令（细粒度） |
| 能力边界 | 白名单：只能做注册过的事 | 黑名单：除沙箱禁止的都能做 |
| 核心差异化 | **tools 列表**（业务接口） | **skills 文件**（提示词/规范） |
| CLI | 通常不需要（通过 API 触发） | 需要（`openhands --sandbox` / `claude --project`） |
| 运行环境 | 进程内 / 容器 | **沙盒**（隔离环境） |

**两类 Agent 可以做同一件业务**（如"帮员工写周报"），区别只在技术架构。

## 代码结构

```
your-project/
├── {ctx}_ctx/                      ← 六边形（领域系统）
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── interface/                  ← 暴露入口（HTTP + Agent tool schema）
│
└── agents/                         ← Actor 区域（独立于六边形）
    ├── {agent_name}/
    │   ├── manifest.py             #  @agent 声明（看板展示用）
    │   ├── agent.py                #  Agent 实现
    │   ├── tools.py                #  工具注册
    │   └── prompts/                #  提示词文件（Coding Agent 用）
    └── {another_agent}/
        └── ...
```

## 装饰器

### @agent — Agent 身份声明

```python
@agent(
    id="report_writer",             # 唯一标识
    name="周报撰写助手",             # 展示名称
    type="tool_use",                # tool_use | coding
    framework="agentscope",         # agentscope | openhands | langchain | custom
    description="...",              # 一句话职责
    triggers=["事件名", "用户说'xxx'"],  # 什么时候触发
    operates_on=["ctx_id_1", ...],  # 关联哪些 Context
)
```

`type` 只有两个取值：
- `tool_use`：通过预定义工具操作（AgentScope / LangChain）
- `coding`：通过代码编辑操作（OpenHands / Claude Code），运行在沙盒

### @agent_tool — 工具声明

```python
@agent_tool(
    name="update_draft",            # 工具函数名
    description="将内容写入周报草稿", # 工具描述
    direction="command",            # query | command
    target_ctx="weekly_report",     # command 时：操作哪个 ctx
    source="邮件系统",              # query 时：数据来自哪里（外部源）
    maps_to="submit_report",        # 可选：对应 application 层的 command/query handler 名字
)
```

`direction` 按是否改变状态分类：
- `query`：获取信息，不改变任何状态（不管数据来自外部还是领域系统）
- `command`：改变系统状态

#### query 工具的映射规则

如果 `direction="query"` 且数据来自领域系统（不是外部 API），**必须**通过 `maps_to` 指向 application 层的 `@query_handler`：

```python
# ✅ 正确：query 工具映射到 application 层的 query handler
@agent_tool(
    name="read_my_reports",
    direction="query",
    target_ctx="weekly_report",
    maps_to="get_my_reports",       # ← 对应 weekly_report_ctx/application/queries/get_my_reports.py
)

# ❌ 错误：query 工具直接 SQL，绕过 application 层
@agent_tool(name="read_my_reports", direction="query")
async def read_reports():
    return db.execute("SELECT * FROM reports WHERE ...")
```

由 lint 规则 `agent-query-tool-needs-handler` 强制（warning 级，因为外部源 query 工具是允许的）。
详见 02-decorator-vocabulary.md 的"CQRS 查询侧"段。

### @agent_skill — 技能/提示词文件（Coding Agent 专用）

```python
@agent_skill(
    name="codeisall",
    description="DDD 设计与实现规范",
    path="codeisall-skill/SKILL.md",
)
```

Coding Agent 的核心差异化。同样的 file+shell+browser 基础能力，skill 决定了 Agent 怎么用这些能力。

### @agent_cli — 启动方式（Coding Agent 专用）

```python
@agent_cli(
    command="openhands",
    args=["--sandbox", "--workspace", "./"],
    description="在沙盒中启动",
)
```

### @agent_constraint — 约束

```python
@agent_constraint(rule="只能操作当前用户本人的周报")
```

## Agent 与 Domain 的关系规则

### 规则 1：Agent 通过 interface 层操作领域，不直接 import domain

```python
# ✅ 正确：Agent 工具通过 HTTP API 操作
async def tool_submit_report(report_id, as_user):
    r = await httpx.post(f"{API}/api/reports/{report_id}/submit", headers={"x-user-id": as_user})
    return r.text

# ❌ 错误：Agent 直接 import 聚合根
from weekly_report_ctx.domain.report import WeeklyReport
report = repo.find_by_id(id)
report.submit(approver_id)  # 绕过了 interface/application 层
```

### 规则 2：Domain 不知道 Agent 存在

```python
# domain/report.py 里绝不会出现：
if caller_type == "agent": ...  # ❌ domain 不区分操作者
```

domain 层只校验"参数是否合法、规则是否满足"，不关心谁在调用。

### 规则 3：Agent 受同一套规则约束

Agent 调 `submit_report` 跟人在 GUI 点"提交"走**完全一样的路径**：

```
Agent tool_submit → HTTP POST /api/reports/{id}/submit
                  → SubmitReportHandler.handle()
                  → WeeklyReport.submit()
                  → NotEditable? EmptyReport? → 拒绝
```

Agent 不能绕过不变量。

### 规则 4：Agent 的"智能"不是领域规则

| 领域规则（domain 层） | Agent 的"智能"（agents/ 内部） |
|---------------------|---------------------------|
| "已提交不可编辑" | "读完邮件提炼出本周亮点" |
| "审批人提交时锁定" | "判断哪些内容放 blockers" |
| 违反 = 系统损坏 | 换一种方式也能做（模板/人工） |
| 不可替换 | 可替换（换框架/换模型/换人） |

### 规则 5：agents/ 目录不受六边形依赖方向约束

Agent 内部自由使用任何技术 —— AgentScope / LangChain / 裸 LLM API / 浏览器自动化。
这些都是 Agent 自己的事，跟领域系统的架构无关。

## 在看板中的展示

### Agent 视图（独立 Tab）

| 区块 | Tool-use Agent 展示 | Coding Agent 展示 |
|------|----|----|
| 标题 | 🤖 名称 [Tool-use] [框架] | 🤖 名称 [Coding] [框架] |
| 描述 | ✅ | ✅ |
| 触发方式 | ✅ | ✅ |
| 关联 Context | ✅ | ✅ |
| 🔍 查询工具 | **重点**（业务级 tool） | 基础（file_read/browser） |
| ⚡ 命令工具 | **重点**（业务级 tool） | 基础（file_write/shell） |
| 📚 技能 | 通常无 | **重点**（提示词文件列表） |
| 💻 启动方式 | 通常无 | **重点**（CLI 命令） |
| 🚫 约束 | ✅ | ✅ |

### 与领域视图的关联

Agent 卡片的 `operates_on` 字段关联到领域视图的 Context 框。
未来可以做：从领域视图的 ctx 框点击"查看关联 Agent"跳转到 Agent 视图。

## 何时需要声明 Agent

| 场景 | 是否写 manifest.py |
|------|-------------------|
| 项目有 AI 自动化能力（自动写周报/自动审批/自动通知） | ✅ 写 |
| 用 Claude Code 手动辅助开发（你自己用 CLI 改代码） | ❌ 不写（你不是系统的一部分） |
| 有定时任务（cron 定期归档） | ❌ 不写（定时任务在 application 层，不是独立 Actor） |
| 有外部系统调 API（另一个微服务） | ⚠️ 视情况 —— 如果它有自主决策逻辑就写 |

**判断标准：它有没有"自主决策"能力？** 如果只是按固定逻辑触发（cron / webhook），不算 Agent。如果它会"看情况决定做什么"（LLM 推理 / 规则引擎），就是 Agent。

## Agent 测试策略

### 核心原则

> **不测 Agent 怎么想的（中间推理步骤），只测最终做了什么（系统状态变化）。**

Agent 的推理路径不确定（LLM 可能先读邮件再读日程，也可能反过来），但最终结果应该可验证。

### 测试金字塔

```
        /\
       /  \    评估测试（真实 LLM，统计成功率，不在 CI）
      /    \
     /------\   行为测试（Mock LLM，验证最终系统状态，在 CI）
    /        \
   /----------\  工具单元测试（确定性，跟传统一样，在 CI）
  /____________\
```

### 第 1 层：工具单元测试（确定性）

验证每个 tool 函数的 IO 正确性。跟传统 API client 测试一样。

```python
async def test_update_draft_tool_calls_api(httpx_mock):
    """tool 正确调用 HTTP API + 正确处理响应"""
    httpx_mock.add_response(url=".../api/reports/r1/draft", method="PUT", json={"status": "ok"})

    tools = create_tools(user_id="u1", week="2026-W23")
    result = await tools["update_draft"]("r1", "亮点", "计划", "无")

    assert result == "草稿已更新"
    req = httpx_mock.get_request()
    assert req.headers["x-user-id"] == "u1"

async def test_update_draft_handles_error(httpx_mock):
    """tool 正确处理 API 错误"""
    httpx_mock.add_response(status_code=400, json={"detail": "NotEditable"})

    tools = create_tools(user_id="u1", week="2026-W23")
    result = await tools["update_draft"]("r1", "", "", "")

    assert "失败" in result
```

**特点**：确定性、快速、不需要 LLM、在 CI 中跑。

### 第 2 层：行为测试（Mock LLM，验证最终结果）

Mock 掉 LLM 让测试确定。**只验证最终系统状态，不验证 Agent 的中间推理。**

```python
async def test_agent_generates_draft_and_writes():
    """Agent 收到任务后，最终周报草稿被更新"""
    # 准备：空草稿
    repo = InMemoryWeeklyReportRepository()
    report = create_draft_report("r1", "u1", "2026-W23")
    repo.save(report)

    # Mock LLM：预设 tool 调用序列
    mock_llm = MockLLM(script=[
        {"tool_calls": [{"name": "read_emails", "args": {}}]},
        {"tool_calls": [{"name": "update_draft", "args": {
            "report_id": "r1", "highlights": "完成DDD设计", ...
        }}]},
        {"content": "完成"},
    ])

    agent = create_agent_with_mock(mock_llm, repo)
    await agent.run("帮我写周报")

    # 验证最终结果
    result = repo.find_by_id("r1")
    assert result.highlights != ""      # 被填充了
    assert result.status == "draft"     # 没自动提交（约束生效）

async def test_agent_respects_domain_constraints():
    """Agent 尝试修改已提交周报 → 被领域规则拒绝"""
    repo = InMemoryWeeklyReportRepository()
    report = create_submitted_report("r1", "u1", "2026-W23")
    repo.save(report)

    mock_llm = MockLLM(script=[
        {"tool_calls": [{"name": "update_draft", "args": {"report_id": "r1", ...}}]},
        {"content": "无法修改，周报已提交"},
    ])

    agent = create_agent_with_mock(mock_llm, repo)
    await agent.run("帮我重写周报")

    # 周报内容没变（领域规则拒绝了 Agent）
    assert repo.find_by_id("r1").highlights == original_highlights
```

**特点**：确定性（Mock LLM）、在 CI 中跑、验证"Agent + 领域规则"的协作。

### 第 3 层：评估测试（真实 LLM，统计成功率）

用真实 LLM 跑，验证成功率是否达标。**不在 CI 中，定期手动评估。**

```python
EVAL_CASES = [
    {
        "input": "帮我写本周周报",
        "setup": {"tasks": ["完成DDD设计", "修复3个bug"]},
        "expected": {
            "status_after": "draft",
            "highlights_not_empty": True,
            "highlights_contains_any": ["DDD", "bug"],
        },
    },
    {
        "input": "写完周报直接提交",
        "setup": {"tasks": ["写文档"]},
        "expected": {
            "status_after": "submitted",
        },
    },
]

@pytest.mark.parametrize("case", EVAL_CASES)
async def test_agent_eval(case):
    repo = setup_repo(case["setup"])
    agent = create_real_agent(repo)  # 真实 LLM

    await agent.run(case["input"])

    report = repo.find_by_id("r1")
    if "status_after" in case["expected"]:
        assert report.status == case["expected"]["status_after"]
    if "highlights_not_empty" in case["expected"]:
        assert report.highlights.strip() != ""
    if "highlights_contains_any" in case["expected"]:
        assert any(k in report.highlights for k in case["expected"]["highlights_contains_any"])
```

**特点**：
- 不在 CI（LLM API 成本 + 不确定性）
- 定期跑（每周 / 每次改 prompt 后）
- 看成功率（"10 次中 8 次成功 = 80%"）而非 pass/fail
- 验证"结果范围"（contains_any）而非"精确值"（assertEqual）

### 对比总结

| | 领域单元测试 | Agent 工具测试 | Agent 行为测试 | Agent 评估测试 |
|---|---|---|---|---|
| 确定性 | ✅ | ✅ | ✅（Mock LLM） | ❌ 统计性 |
| CI 里跑 | ✅ | ✅ | ✅ | ❌ 手动 |
| 验证什么 | command 的 pre/post/fails | tool 函数 IO | 最终系统状态 | 成功率 |
| 速度 | 毫秒 | 毫秒 | 毫秒 | 秒级 |
| 成本 | 零 | 零 | 零 | LLM API 费用 |

### CI 必须通过（硬门禁）

```
pytest tests/
├── test_domain/          ← 领域单元测试（每个 command + invariant）
├── test_integration/     ← 领域集成测试（Handler + 真实 adapter）
├── test_agent_tools/     ← Agent 工具单元测试（每个 tool 的 IO）
└── test_agent_behavior/  ← Agent 行为测试（Mock LLM + 最终状态）
```

### 定期评估（非 CI）

```
pytest tests/eval/ --real-llm
└── test_agent_eval.py   ← 真实 LLM，统计成功率，改 prompt 后必跑
```
