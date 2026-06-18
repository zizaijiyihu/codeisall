---
name: codeisall
description: 代码即一切知识的开发框架。基于 DDD 方法论，用 Python 装饰器定义可执行规格（领域模型），配合可视化看板、15 条 lint 规则、知识驱动测试、Agent 架构。当用户提到设计系统、领域建模、做 Agent、可执行规格、代码即知识、跑 lint、看板时使用。
---

# codeisall：代码即一切知识，视图信息更友好

> **哲学**：代码即一切知识，视图信息更友好。
>
> **定位**：人做架构师（结构正确 + 知识正确），AI 做建设者（写代码 + 写测试 + 验证）。
>
> **人的职责**：审阅结构、确认知识、在看板上说"对"或"不对"。不写代码。
>
> **AI 的职责**：写装饰器骨架、填实现、生成测试、标红变更、跑验证。按规范执行。

## 核心概念：可执行规格（Executable Specification）

codeisall 的设计阶段产出不是文档，不是 JSON，是**可执行规格** —— 带装饰器、body 为 pass 的代码。

```python
# 这就是一个可执行规格：
@aggregate_root(context="weekly_report", description="周报聚合根")
@dataclass
class WeeklyReport:
    @invariant(description="已提交不可编辑", fields=["status", "content"])
    def _inv(self): pass

    @command(emits="Submitted", pre="status==draft", post="status=submitted")
    def submit(self, approver_id): pass  # ← body=pass，规格已定义，实现待填
```

**为什么叫"可执行"？** 因为它不是写完就扔的文档，它能被机器处理：

| 传统设计文档（Markdown/Word） | 可执行规格（codeisall） |
|---|---|
| 写完没人看，跟代码不同步 | 就是代码，不可能不同步 |
| 不能跑 lint | ✅ 15 条 lint 规则静态检查 |
| 不能自动渲染 | ✅ 看板实时展示 |
| 不能关联测试 | ✅ @verifies 直接关联 |
| 改了不知道影响什么 | ✅ source_location 精确到行 |

**工作流中的两个阶段**：

```
阶段 1（设计）→ 产出：可执行规格（装饰器 + pass body）
                     看板完整展示，lint 通过，人审阅确认

阶段 2（实现）→ 产出：可运行代码（填充 body + infra + 测试）
                     装饰器不动，看板不变，测试全过
```

向用户解释时可以这样说：
> "我们先写**可执行规格** —— 用装饰器定义系统的规则和行为契约，方法体先留空。
> 这不是普通的代码骨架，它能被 lint 检查、能在看板上可视化、能跟测试直接关联。
> 你在看板上审阅确认后，我再填充实际逻辑。"

## 知识的三个层次

| 层次 | 载体 | 谁写 | 谁审 |
|------|------|------|------|
| **声明性知识**（是什么/不能什么） | 装饰器（@invariant / @command / @term） | AI 写，人审 | 人在看板审 |
| **验证性知识**（怎么证明声明是真的） | 测试代码（@verifies 标注） | AI 写，人审 | 人看覆盖率 |
| **实现性知识**（具体怎么做到的） | method body | AI 写 | AI 自验（lint + 测试通过） |

看板是这三层知识的**统一展示界面** —— 人不需要读代码，只需要看看板。

## 完整工作流

```
人口述需求
  → AI 写装饰器骨架（声明性知识）
  → 人看板审阅 → "对" / "这里不对，改"
  → AI 填 method body（实现性知识）
  → AI 生成测试 + @verifies 标注（验证性知识）
  → 人看"知识覆盖率" → 确认全覆盖
  → lint 0 errors + 测试全过
  → 完成
```

## 触发条件

当用户提到以下任一情况时使用此技能：

- 设计一个系统 / 做领域建模 / 从零开始建项目
- 在现有代码库加新需求 / 改老逻辑（增量演进）
- 想看当前系统的结构 / 不变量 / 事件流 / 边界
- 想知道某个改动会影响哪些模块
- 做一个 Agent / 定义 AI 助手
- 运行 / 部署 codeisall 看板
- "把改动标记在看板上"、"在视图里标红"
- 跑 lint 检查 / 看测试覆盖
- "可执行规格"、"代码即知识"

## 与 ddd-review-skill 的分工

codeisall 的领域建模基于 DDD 方法论（聚合根 / 不变量 / 命令 / Bounded Context），但 codeisall 本身不是"DDD 工具" —— 它是**代码即知识的开发框架**，DDD 是它的建模方法论之一。

| 场景 | 入口 skill | 另一个 skill 的角色 |
|------|-----------|--------------------|
| 审查代码的 DDD 合规性 | `ddd-review-skill` | 不参与 |
| 设计系统、加需求、做 Agent | `codeisall`（本技能） | 需要 DDD 原理时查 ddd-review-skill |
| DDD 战略/战术建模原则 | `codeisall` | 查 `ddd-review-skill/08-strategic-modeling.md` |

**本技能负责操作流程和工具链；DDD 原理 / 规范 / 反模式由 `ddd-review-skill` 承担**。

## 引用文件索引

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `01-server-and-api.md` | server 启动、API 契约、健康检查 | 第一次接入 / server 没起来 / 调用 API 前 |
| `02-decorator-vocabulary.md` | 装饰器词汇表 + 字段含义 + 约束 | 写装饰器骨架 / 不确定某装饰器的参数 |
| `03-from-zero-design.md` | 从零设计的完整流程（manifest → domain → handlers） | 用户要求"帮我设计 XX 系统的 DDD" |
| `04-incremental-change.md` | 增量改动流程（标红 → 审阅 → 改 → 验证） | 用户要求"加 / 改 / 删 / 拆 XX" |
| `05-pending-changes-protocol.md` | 待修改清单的 node_id 规则、change_type 语义 | 写 pending-changes 时 |
| `06-verification.md` | 改完之后的验证闭环（model + lint） | 任何代码修改完毕后必读 |
| `07-implementation.md` | 实现阶段流程（设计完成后填 body / 写 infra / 写 interface） | 用户说"开始实现 / 写代码 / 填充逻辑" |
| `08-agent-architecture.md` | Agent 架构：与领域的关系、两类 Agent、装饰器、视图规则 | 涉及 Agent 设计 / @agent 装饰器 / Agent 视图 |
| `09-requirements-discovery.md` | 需求追问框架：结构化追问 → 直接产出装饰器骨架 | 用户说出需求但信息不完整时 |
| `10-rules-and-invariants.md` | 不变量 vs 业务规则：判定流程 + 守护代码强制规则 | 写 @invariant 或 @business_rule 前必读 |
| `11-eventual-consistency.md` | 最终一致性保障：幂等 / Outbox / Saga / ACL / 失败策略 | 跨 ctx 业务规则实现时必读 |
| `12-domain-review-checklist.md` | 领域建模自查清单（A-F）| 设计阶段 1-3 完成、启动 domain-reviewer 前必读 |
| `13-code-review-checklist.md` | 代码实现自查清单（G-K）| 实现阶段 4-5 完成、启动 code-reviewer 前必读 |
| `14-review-subagents.md` | 双 Reviewer 复审协议：domain-reviewer + code-reviewer 分阶段把关 | 完整流程的两个门禁，必读 |

加载策略：**SKILL.md 的铁律始终生效，分文件按需读取。** 不要一次全读。

---

## 核心铁律（始终生效）

### 铁律 0：代码是唯一真相

- 不要为同一个事实维护两份：**装饰器代码就是设计文档**，不要再写 design.json / design.md
- 看板是代码的投影，**改看板没用**（看板不可编辑）；改代码看板自动更新
- pending-changes 是"待办清单"，不是"模型快照"，不要混淆

### 铁律 1：装饰器参数必须是字面量

- ✅ `@command(emits="OrderPlaced")`
- ❌ `@command(emits=EVENT_NAME)`、`@command(emits=f"...")`、`@command(emits=get_event())`

理由：extract.py 用 AST 静态分析，看不见运行时值。违反此规则的装饰器会被静默丢弃，看板上就消失了。

### 铁律 2：设计完整通过审阅后才能写实现代码

整个流程分两个大阶段，**阶段门禁严格**：

**阶段 1（设计）**：
- 写装饰器骨架（@bounded_context / @term / @aggregate_root / @invariant / @command / @event_handler 等）
- method body 全是 `pass`
- 看板可视化 + lint 通过 + 用户在看板上审阅确认
- **此阶段严禁写任何业务逻辑**

**阶段门禁**：以下条件全部满足才能进入阶段 2 ——
- [ ] 所有 Context 有 manifest.py 且看板渲染正确
- [ ] 所有聚合根有 @invariant + @command 且 lint 0 errors
- [ ] 跨 Context 事件有 @event_handler
- [ ] 用户明确说"设计 OK / 开始实现 / 进入实现"
- [ ] 不满足任何一条就**继续留在阶段 1 迭代**

**阶段 2（实现）**：
- 装饰器**不动**（看板内容不变）
- 填 method body（业务逻辑）
- 新建 infrastructure/（Repository / Publisher / ACL adapter）
- 新建 interface/（HTTP / CLI 接口）
- 跑单元/集成测试验证

**看板内容由装饰器决定，与 body 无关** —— 设计完成后看板就是定稿，实现阶段再多代码看板都不变。

### 铁律 3：每次改动遵循"标红 → 审阅 → 改 → 验证"四步

1. **标红**：分析需求 → `PUT /api/pending-changes` 写入受影响节点（看板自动高亮）
2. **审阅**：把改动计划文本输出给用户，等待确认
3. **改**：根据 `source_location` 精确定位文件行号 → Edit
4. **验证**：重拉 `/api/model` 对照预期 + 跑 `/api/lint` 0 errors → `DELETE /api/pending-changes`

跳过任一步都算违规。特别是"标红"不能省 —— 用户必须有机会在改之前看到范围。

### 铁律 4：跨 Context 改动必须事件化

不要让 Context A 直接 import Context B 的类。跨 Context 通信只能：
- 用 Integration Event（在 `application/handlers/` 写 `@event_handler`）
- 用 ACL（防腐层，`@anticorruption_layer`）

详细规则参考 `ddd-review-skill/02-dependency.md` 和 `05-event-system.md`。

### 铁律 5：装饰器 → 看板 → codeisall-lint 三方一致

任何改动后必须做：
- `GET /api/model` 看看板模型，节点数量 / 字段 / 关系符合预期
- `GET /api/lint` 0 errors（warnings 单独处理）
- 任意一边不符合预期就回滚或继续改

不要"代码改了 lint 还没过就告诉用户'好了'"。

### 铁律 6：实现阶段必须有测试

实现阶段（填 method body 后）的交付标准：

- **单元测试**：domain 层每个 @command 方法 + 每个 @invariant 约束必须有对应 test case
  - 正向：happy path 验证 post 条件
  - 反向：违反 pre 条件抛异常、违反 invariant 抛异常
  - 零依赖：不需要 DB / 网络 / 文件，直接 new 聚合根测
- **集成测试**：application Handler 的 happy path 至少跑一遍（含真实 DB）
- **测试不过不算完成** —— 跟 lint 一样是硬门禁

详细策略见 `07-implementation.md` 的"测试策略"段。

### 铁律 7：声明性知识必须落到守护代码上

装饰器位置 = 守护代码位置，**物理上不可分离**。

- `@invariant` 必须装在聚合根的方法_xxx 方法）
- `@vo_constraint` 必须装在值对象类上
- `@business_rule` 必须装在 `@event_handler` 函数上 或 `@domain_service` 方法上
  - involves 必须 ≥ 2 个聚合（单聚合规则改用 @invariant）
  - 多步规则用 `id="BR-xxx"` 关联同一规则
- **禁止独立的 business_rules.py 文件**（空类 + 装饰器 = 假知识）

违反此铁律 = 看板撒谎（看板显示有规则，代码里没人守护）。
详见 `10-rules-and-invariants.md`。

### 铁律 8：两个阶段，两个 Reviewer，两道门禁

codeisall 把 Reviewer 拆成**两个 subagent**，各管一段：

| 阶段 | 自查清单 | 复审 subagent | 门禁含义 |
|---|---|---|---|
| 设计阶段（1-3）完成 | `12-domain-review-checklist.md` | `domain-reviewer` | 不过 → 不允许进入实现 |
| 实现阶段（4-5）完成 | `13-code-review-checklist.md` | `code-reviewer` | 不过 → 不允许告诉用户"完成" |

每个阶段都必须：**主 Agent 自查 → 对应 reviewer 复审 → 通过才放行**。

看板 0 红标 + lint 0 errors + 测试 0 fail 是 code-reviewer 阶段的硬指标。

跳过任一 reviewer = 违规。详见 `14-review-subagents.md`。

### 铁律 9：前后端两个端口必须同时活

codeisall 看板由两个服务支撑，**任何动作前先确认双活**：

| 端口 | 进程 | 谁来访问 |
|---|---|---|
| 5171 | vite dev server | **人**（浏览器唯一入口） |
| 8502 | uvicorn FastAPI | Claude API 调用 + vite proxy |

**铁律细则**：

1. 任何 codeisall 操作前先 `curl http://localhost:5171/` + `curl http://localhost:8502/api/source`，确认双 200
2. 重启 8502 时 5171 经常被连带杀掉（同 shell 进程组），**重启后立即验证 5171 还在**
3. 启动必须用 `nohup ... > /tmp/codeisall-{api,vite}.log 2>&1 &`，禁止前台跑
4. `live: false` 也算异常（看板会回退到 demo_model.json，不反映真实代码）

跳过双活检查就操作 = 用户可能看到旧版本/空看板而不自知。详见 `01-server-and-api.md` 的"健康检查"段。

### 铁律 10：动手建模前，必须先完整走一遍领域

**最高优先级铁律之一**：在写任何装饰器（manifest.py / domain/*.py）之前，必须先把业务**端到端走一遍**并把全景图摆给用户看 —— 用户没确认全景图前，禁止写代码、禁止进入需求追问的"细节问题"。

#### 必须摊开的五件事

| # | 内容 | 不摊开会怎样 |
|---|---|---|
| 1 | **完整流程**：从触发到归档每个阶段 | 漏掉中间阶段（比如"简历筛选"、"offer 谈薪"），模型出来后整体重构 |
| 2 | **所有角色**：每阶段谁在做什么、谁不能做什么 | 角色权限拍脑袋，pre 条件写不全 |
| 3 | **所有制品**：会被创建/修改/查询的业务对象 | 漏掉对象（比如"渠道"、"简历版本"），后期补充时聚合根边界要重划 |
| 4 | **状态机 + 异常路径**：每个核心对象的所有状态、合法转换、异常分支（no-show / 超时 / 主动撤回 / 冲突 / 反悔） | 状态机不全，invariant 列不完，实现时各种 case 漏处理 |
| 5 | **隐含规则**：业务里没明说但显然存在的约束 | 关键 invariant 漏写，看板呈现的规则少于实际业务规则 |

#### 禁止行为

- ❌ 用户给了几个关键词（"岗位/候选人/面试"）就直接划 Context、列聚合根
- ❌ 在状态机还没画完时就开始用 AskUserQuestion 问细节
- ❌ 用"合理默认"掩盖你没想清楚的环节 —— **默认本身就是设计决策**，必须显式让用户拍板
- ❌ 把 AskUserQuestion 当成"对齐工具"代替深度思考 —— 问题列表里全是你没想透的盲点，用户会感觉你在敷衍
- ❌ 用户一旦说"开始设计"就立刻 TaskCreate 写骨架 —— 必须先有"全景图被确认"这一步

#### 正确动作（顺序严格）

1. **第一轮回答先呈现"业务全景图"**（流程 + 角色 + 状态机 + 异常路径），并**显式列出**："我之前没想到的点 / 隐含但需要确认的点"
2. **让用户挑错** —— 用户的反馈是"你这里漏了 XX"、"YY 不是这样"，比 AskUserQuestion 价值高 10 倍
3. 用户对全景图确认/修正后，再用 AskUserQuestion 只问 **真正会改变领域结构** 的边界问题（聚合归属、Context 拆分、是否纳入系统范围、关键不变量取值）
4. 全景图确认 + 关键边界问题答完，才能写 manifest.py

#### 与铁律 2 的关系

铁律 2 是"设计完整通过审阅后才能写实现"；铁律 10 比它更早一步 —— **领域全景图未被用户确认前，连设计代码（装饰器骨架）都不能写**。

```
铁律 10：领域全景图 → 用户确认 → 才能写装饰器骨架（进入"设计阶段"）
                ↓
铁律 2：装饰器骨架 → 看板 + lint + 用户审 → 才能写 method body（进入"实现阶段"）
                ↓
铁律 6 + 8：实现 + 测试 + code-reviewer 通过 → 才能告诉用户"完成"
```

违反铁律 10 = 建模时不知道有些环节存在 → 模型出来后大概率要重构 → 用户看你"很努力"但产出在打补丁。

---

## 两种使用模式

### 判断标准

> **你需不需要在已有系统之上叠加自己的规则（不变量/命令契约/ACL 翻译）？**

| | 全栈模式 | Agent-only 模式 |
|---|---|---|
| **条件** | 系统不存在 / 已有系统规则不够用 | 已有系统接口健全，规则够用 |
| **建什么** | 完整六边形 + Agent | 只定义 Agent（manifest.py + tools.py） |
| **领域层** | 有（@aggregate_root / @invariant / @command） | 无（已有系统的领域层够用） |
| **infra 层接什么** | DB 或 已有系统 API（都是 adapter，结构一样） | — |
| **看板** | 领域视图 + 架构视图 + Agent 视图 | Agent 视图 |
| **lint** | 15 条全开 | 只检查 agent-no-domain-import |

> 注：所谓"半栈"（已有系统 + 补几个能力）本质就是全栈 —— 区别只在 infrastructure 的 adapter 指向已有系统 API 而非自己的 DB。从六边形角度，"已有系统 API"跟"MySQL"是同一个东西。

### 全栈模式的流程入口

> 触发："帮我设计 XX 系统" / "做个 XX 的领域建模" / "做一个 XX agent"（但系统还不存在）

详见 `03-from-zero-design.md`。简述：

1. 跟用户讨论业务边界 → 写 `{ctx_id}_ctx/manifest.py`（战略层装饰器，body 全 pass）
2. 看板自动出现新 Context 框（带术语、路由、边界声明）
3. 跟用户讨论聚合根 → 写 `{ctx_id}_ctx/domain/*.py`（@aggregate_root + @invariant + @command，body 全 pass）
4. 看板出现聚合 + 不变量 + 命令契约
5. 跟用户讨论跨 Context 事件 → 写 `{ctx_id}_ctx/application/handlers/*.py`（@event_handler）
6. 看板出现跨 Context 集成边
7. 用户确认设计完整 → 进入实现阶段（填充 body）
8. 如果有 Agent → 写 `agents/*/manifest.py`

整个过程不写 JSON / Markdown 设计文档，**装饰器代码就是设计文档**。

如果用户的入口是"做一个 XX agent"但系统还不存在：
- 从 Agent 的 tools 需求**倒推**领域需要提供什么能力
- 然后走正常的战略 → 战术 → 集成流程建领域
- 最后定义 Agent

### Agent-only 模式的流程入口

> 触发："给已有系统加个 agent" / "做一个 agent 调 XX 的 API"（系统已健全）

1. 确认已有系统的接口（列出可用 API）
2. 定义 Agent：写 `agents/*/manifest.py`（@agent + @agent_tool + @agent_constraint）
3. 实现 tools.py（直接调已有系统 API，不建领域层）
4. 人在 Agent 视图审阅
5. 完成

### 增量修改流程

> 触发："加一个 XX 功能" / "把 XX 改成 YY" / "拆分 XX 聚合" 等

详见 `04-incremental-change.md`。简述：

1. `GET /api/model` 读当前模型
2. 分析需求，推理出受影响的节点（聚合 / 不变量 / 命令 / 事件 / Context）
3. `PUT /api/pending-changes` 标红（同时输出文字改动计划给用户）
4. 等用户确认
5. 按 `source_location` 精确改代码
6. 跑验证 → 清空 pending

---

## 启动 server

每次工作开始前先确认 server 在跑（端口 8502）。详见 `01-server-and-api.md`。

```bash
# 定位到 skill 目录（Claude 从 SKILL.md 所在目录找）
SKILL_DIR="<codeisall-skill 所在路径>"

# 启动（用自带示例）
$SKILL_DIR/scripts/codeisall.sh

# 启动（指定用户项目）
$SKILL_DIR/scripts/codeisall.sh /path/to/your-project

# 停止
$SKILL_DIR/scripts/codeisall.sh stop

# 查看状态
$SKILL_DIR/scripts/codeisall.sh status
```

> 首次启动会自动安装 viewer/ 的 node_modules（约 30s）。

---

## 当用户发起对话后的第一动作

1. **理解需求**（不暴露内部模式概念给用户）：
   - 用户会说"帮我做 XX" / "设计 XX" / "做个 agent" —— 都正常接
   - 在讨论过程中自然确认：有没有现成系统可用？接口够不够？
   - **AI 内部判断**走哪条路径，用户不需要知道"全栈/Agent-only"这些术语

2. **内部判断逻辑**（不对用户说）：
   - 需要操作的系统不存在 / 规则不够用 → 建领域（读 `03-from-zero-design.md`）
   - 需要操作的系统已有且接口健全 → 只定义 Agent（读 `08-agent-architecture.md`）
   - 在已有项目上改东西 → 增量改动（读 `04-incremental-change.md`）
   - 进入实现 → 读 `07-implementation.md`

3. **首次使用时安装 codeisall 到项目目录**：
   - 检查 `<project>/.claude/skills/codeisall/` 是否存在
   - 不存在 → 把 codeisall skill 整个目录拷贝过去（包括 SKILL.md / scripts / templates / ...）
   - 检查 `<project>/.claude/agents/domain-reviewer.md` 和 `code-reviewer.md` 是否都存在
   - 缺哪个就从 `.claude/skills/codeisall/templates/` 对应文件拷贝过去
   - 拷贝后**明确告诉用户**："已安装 codeisall skill + 双 reviewer subagent（domain-reviewer / code-reviewer），请重启 Claude Code 会话让 subagent 生效"
   - 详见 `14-review-subagents.md` 的"安装协议"段

4. **启动 server**（如果需要看板）：
   - 新项目 → 创建目录 → `codeisall.sh /new/project`
   - 已有项目 → `codeisall.sh /existing/project`
   - **不要默认展示 example** —— 除非用户明确要求

5. **不要急着写代码** —— 严格执行铁律 10：先把领域端到端走一遍，呈现"业务全景图"（流程 + 角色 + 制品 + 状态机 + 异常路径 + 隐含规则），并显式列出"我之前没想到的点"。用户确认全景图、并对关键边界问题（聚合归属、Context 拆分、是否纳入范围）拍板后，才能写第一行装饰器骨架。

   **反例**：用户说"做 XX 系统" → AI 立刻 TaskCreate "编写 X_ctx 骨架" → 立刻动手。这是违规。

   **正例**：用户说"做 XX 系统" → AI 第一轮回答呈现完整业务流转图 + 显式列出自己漏想的环节（headcount？审批？超时兜底？offer 阶段？）→ 用户挑错/补充 → AI 用 AskUserQuestion 问会改变结构的边界问题 → 用户答完 → 才 TaskCreate 进入设计阶段。
