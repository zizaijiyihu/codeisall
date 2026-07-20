---
name: ddd-review
description: DDD Python 建模与代码规范。覆盖战略设计→战术设计→代码实现→Review 全链路；建模 AI 按规格产出，检查 AI 按规则验证。当用户提到 DDD 代码生成、DDD review、聚合根/限界上下文/领域事件实现、领域建模、战略/战术建模原则时使用。
---

# DDD Python 建模与代码规范技能

> 覆盖 DDD 全链路：战略设计 → 战术设计 → 代码实现 → Review。
> 支持两种角色使用同一套标准：建模 AI 按规格产出，检查 AI 按规则验证。

## 触发条件

当用户提到以下内容时使用此技能：
- DDD 代码生成、DDD 项目脚手架
- DDD review、DDD 代码审查
- 领域驱动设计规范检查
- 聚合根、限界上下文、领域事件的代码实现
- 领域建模、战略设计、战术设计
- 需求分析、业务建模、Context 划分
- 增量需求评估、模型变更影响分析

## 引用文件索引

### 建模标准（给建模 AI 和检查 AI 用）

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `08-strategic-modeling.md` | 战略设计产出物规格 + 17 条评判规则 | 划分 Context、定义统一语言、设计 Context 间关系时 |
| `09-tactical-modeling.md` | 战术设计产出物规格 + 30 条评判规则 + Aggregate 卡片模板 | 定义 Aggregate、方法契约、事件因果链、增量需求评估时 |

### 代码规范（给编码 AI 和 review AI 用）

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `01-structure.md` | 目录结构与分层架构 | 生成新项目骨架、检查目录组织时 |
| `02-dependency.md` | 依赖规则铁律与跨 Context 通信 | 检查 import 方向、依赖倒置时 |
| `03-domain-layer.md` | 领域层编码规范（Root/Entity/VO/Event/Service/Repo/Factory） | 编写或 review 领域层代码时 |
| `04-application-layer.md` | 应用层编码规范（Handler/事件职责分配） | 编写或 review 应用层代码时 |
| `05-event-system.md` | 事件机制完整设计（总线/Outbox/幂等/Integration Event） | 涉及事件发布、订阅、跨 Context 通信时 |
| `06-infra-and-naming.md` | 基础设施层规范 + 命名规范 | 编写 Repository 实现、ACL、Open Host Service，或检查命名时 |
| `07-anti-patterns.md` | 反模式检查清单（29 条）+ Review 执行流程 | 执行 DDD review 时必读 |

## 加载策略

核心原则：**SKILL.md 的铁律始终生效，分文件按需读取，不要一次性全部加载。**

### 建模时

| 你在做什么 | 读哪些文件 | 不需要读 |
|-----------|-----------|---------|
| 从需求开始建模（战略） | `08-strategic-modeling.md` | 01~07, 09 |
| 从需求开始建模（战术） | `09-tactical-modeling.md` | 01~08 |
| 完整建模（战略 + 战术） | `08` → 完成后再读 `09` | 01~07 |
| 检查已有建模文档 | 先读 08 或 09 中的评判规则部分 | 产出物规格部分可跳过 |
| 增量需求评估 | `09-tactical-modeling.md`（增量需求影响评估部分） | 01~08 |

### 写代码时

根据当前操作的层，只读对应的 1~2 个文件：

| 你在做什么 | 读哪些文件 | 不需要读 |
|-----------|-----------|---------|
| 新建项目骨架 | `01-structure.md` | 其他全部 |
| 写 Aggregate/Entity/VO | `03-domain-layer.md` | 04~09 |
| 写 Command/Event Handler | `04-application-layer.md` | 01~03, 08~09 |
| 写事件发布/订阅/Outbox | `05-event-system.md` | 01~04, 08~09 |
| 写 Repository 实现/ACL | `06-infra-and-naming.md` | 01~05, 08~09 |
| 不确定逻辑放哪层 | `04-application-layer.md`（末尾有决策树） | 其他 |

**写代码时不要读 `07-anti-patterns.md`**——铁律已经覆盖了写代码时最易犯的错误，反模式清单是 review 阶段用的。

### Review 代码时

读取 `07-anti-patterns.md` 获取完整的检查清单和流程。Review 分两种模式：

**增量检查（默认）**：commit 前、日常 review。只看 `git diff` 变更的文件，只读变更涉及的层的规范文件。快速、轻量。

**全量审查（用户主动要求）**：从宏观到微观分三层扫，每层输出报告后暂停，用户确认再深入下一层：
- Level 1 架构全景 → 读 `01-structure.md` + `02-dependency.md`
- Level 2 层内契约 → 读 `03-domain-layer.md` + `04-application-layer.md`
- Level 3 实现语义 → 读 `05-event-system.md` + `06-infra-and-naming.md` + 反模式清单

详细流程见 `07-anti-patterns.md`。

---

## 核心铁律（始终生效，无需额外加载）

以下规则在任何 DDD 相关操作中必须遵守：

### 依赖方向

```
interface/ → application/ → domain/
                              ↑
infrastructure/ ──────────────┘
```

- `domain/` 不得 import 任何其他层 (DEP-01)
- `domain/` 不得 import 第三方库，仅允许：`dataclasses`, `typing`, `datetime`, `uuid`, `decimal`, `enum`, `abc`, `collections.abc`, `re` (DEP-02)
- `application/` 不得 import `infrastructure/` 的具体实现类 (DEP-03)
- Bounded Context 之间不得存在代码级 import (DEP-05)

### Aggregate 边界

- Repository 只为 Aggregate Root 建立，不为内部 Entity 单独建 (REPO-01)
- 外部不得直接修改 Root 内部 Entity 的属性 (AGG-02)
- 一个事务只操作一个 Aggregate (AGG-05)
- Root 方法不得接收 Repository/Service 作为参数 (AGG-06)

### 事件机制

- 领域层只产生事件（append 到 `_events`），不发布 (AGG-04)
- 事件发布在应用层，持久化成功之后 (APP-04)
- 跨 Context 事件必须用 Integration Event，不得直接发 Domain Event (EVT-BUS-01)
- 跨 Context 必须经过 ACL 翻译，不得直接使用对方的类 (COM-02)

### Value Object

- 必须 `@dataclass(frozen=True)` (VO-01)
- 修改操作必须返回新实例 (VO-04)

### Domain Event

- 必须 `@dataclass(frozen=True)` (EVT-01)
- 命名用过去式 (EVT-02)
