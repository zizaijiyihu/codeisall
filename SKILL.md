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

3. **启动 server**（如果需要看板）：
   - 新项目 → 创建目录 → `codeisall.sh /new/project`
   - 已有项目 → `codeisall.sh /existing/project`
   - **不要默认展示 example** —— 除非用户明确要求

4. **不要急着写代码** —— 先讨论清楚再动手
