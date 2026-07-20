# 反模式检查清单与 Review 流程

## 反模式清单

AI review 代码时逐项核对以下反模式，发现即报告。

### 领域层污染

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-01 | 领域层 import 第三方库 | 扫描 `domain/` 下所有 import，只允许标准库的 `dataclasses`, `typing`, `datetime`, `uuid`, `decimal`, `enum`, `abc` |
| ANTI-02 | Aggregate Root 接收 Repository/Service 作为方法参数 | 检查 Root 方法签名中是否有 Protocol 类型参数 |
| ANTI-03 | 领域层直接发布事件 | 搜索 domain/ 中是否调用 `publish`、`send`、`emit` 等方法 |
| ANTI-04 | Domain Event 包含 Entity/Root 引用 | 检查 Event 字段类型是否全部是基本类型或 Value Object |

### Aggregate 破坏

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-05 | 外部直接修改内部 Entity 属性 | 搜索 `aggregate_root.entity.field = ` 赋值模式 |
| ANTI-06 | 为非 Root Entity 建立 Repository | 检查 `domain/repository/` 中是否有非 Root 的 Repository |
| ANTI-07 | 一个事务中操作多个 Aggregate | 检查 Handler 中是否对多个 Root 调用 `save` |
| ANTI-08 | Root 方法不校验不变量就修改状态 | 检查状态修改前是否有条件判断 |
| ANTI-09 | Value Object 未使用 `frozen=True` | 扫描 `domain/` 中无标识字段的 dataclass 是否都是 frozen |

### 依赖方向违反

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-10 | Application 层 import infrastructure 的具体类 | 扫描 `application/` 中的 import 来源 |
| ANTI-11 | Domain 层 import application 或 infrastructure | 扫描 `domain/` 中的 import 来源 |
| ANTI-12 | 跨 Bounded Context 直接 import | 扫描每个 Context 的 import 是否引用了其他 Context 的模块 |

### 应用层越权

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-13 | Handler 中包含 if/else 业务判断逻辑 | 检查 Handler 是否只做编排（加载→调用→保存→发事件） |
| ANTI-14 | Handler 直接操作 ORM Model | 搜索 Handler 中是否出现 `session.query`, `Model.filter` 等 |
| ANTI-15 | Handler 中直接构造 SQL 或调用 HTTP | Handler 只能通过注入的接口操作外部 |

### 事件机制滥用

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-16 | 领域层直接调用 EventBus/Publisher | 搜索 domain/ 中的 publish/dispatch 调用 |
| ANTI-17 | 消费方直接使用生产方的 Domain Event 类 | 检查 event_handler 的 import 是否跨 Context |
| ANTI-18 | Integration Event 包含领域对象类型 | 检查 Published Language schema 的字段类型 |
| ANTI-19 | 事件在持久化之前发布 | 检查 Handler 中 publish 和 save 的调用顺序 |
| ANTI-EVT-01 | 用事件实现同步请求-响应 | 检查是否有"等待响应事件"的阻塞逻辑 |
| ANTI-EVT-02 | 事件链过长（超过 3 跳） | 画出事件流转图，超过 3 跳需重新审视边界划分 |
| ANTI-EVT-03 | 事件携带过多数据 | Integration Event 只携带消费方需要的最小字段集 |
| ANTI-EVT-04 | 用事件替代查询 | 检查消费方是否在本地维护了生产方的数据镜像 |
| ANTI-EVT-05 | Outbox 表和业务表不在同一事务 | 检查 save + outbox.save 是否在同一个事务上下文 |
| ANTI-EVT-06 | 消费端无幂等保护 | 检查 event_handler 是否有去重机制或天然幂等说明 |
| ANTI-EVT-07 | Domain Event 直接发到消息队列 | 检查 publisher 发送的是否是 Integration Event 而非 Domain Event |

### 其他

| 编号 | 反模式 | 检查方法 |
|------|--------|---------|
| ANTI-20 | 贫血模型：Root 只有 getter/setter，业务逻辑全在 Service | 检查 Root 是否有除 `__init__` 外的业务方法 |
| ANTI-21 | 万能 Service：一个 Domain Service 处理所有业务 | 检查 Service 方法数量是否过多（>5个方法需警惕） |
| ANTI-22 | ACL 缺失：直接将外部 JSON/dict 传入 Handler | 检查 event_handler 的入参是否是本 Context 定义的类型 |

---

## Review 执行流程

有两种模式，根据场景自动判断：

---

### 模式一：增量检查（默认模式）

**触发**：用户说"检查一下"、"review 下代码"、commit 前 review，或没有明确要求全量时。
**范围**：只看 `git diff` / `git diff --cached` 涉及的变更文件。

#### 执行步骤

**第 1 步：确定变更范围**

```bash
# 获取变更文件列表
git diff --cached --name-only    # 已暂存
git diff --name-only             # 未暂存
```

识别每个变更文件属于哪个 Context、哪一层。

**第 2 步：边界检查（每个变更文件必做）**

只回答两个问题：
- [ ] 这个文件放对层了吗？（新增文件尤其要看）
- [ ] 这个文件的 import 有没有违反依赖方向？

这一步不需要额外读取规范文件，SKILL.md 中的铁律足够判断。

**第 3 步：变更文件的层内检查（只读涉及层的规范）**

根据变更文件所在的层，**只读对应的规范文件**，检查变更部分：

| 变更文件在 | 读取 | 检查重点 |
|-----------|------|---------|
| `domain/aggregate/` | `03-domain-layer.md` | Root 方法是否校验不变量、是否直接发布事件、VO 是否 frozen |
| `domain/event/` | `03-domain-layer.md` | Event 是否 frozen、命名是否过去式、字段是否含 Entity 引用 |
| `application/command/` | `04-application-layer.md` | Handler 是否只做编排、是否有业务逻辑泄漏、事件发布是否在 save 之后 |
| `application/event_handler/` | `04-application-layer.md` | 入参是否是本 Context 类型（ACL 是否到位）、是否有幂等保障 |
| `infrastructure/messaging/` | `05-event-system.md` | Outbox 是否同事务、Integration Event 是否用基本类型 |
| `infrastructure/persistence/` | `06-infra-and-naming.md` | ORM Model 是否泄漏到 domain |
| `infrastructure/acl/` | `06-infra-and-naming.md` | 输出是否为本 Context 自定义类型 |
| `interface/open_host/` | `06-infra-and-naming.md` | Schema 是否用基本类型、是否有版本号 |

**不在变更范围内的文件不检查、不涉及的层不读规范。**

**第 4 步：跨文件影响判断（变更涉及 2 个以上文件时）**

- [ ] 新增的 Domain Event 是否有对应的 Handler？
- [ ] 新增的 Repository 接口是否有对应的实现？
- [ ] 改了 Aggregate Root 的方法签名，调用方（Handler）是否同步更新？

#### 增量检查输出格式

```
## DDD 增量检查（N 个变更文件）

### 变更文件
- domain/aggregate/order/order.py（领域层）
- application/command/place_order.py（应用层）

### 问题
- [ ] [规则编号] 文件路径:行号 — 具体描述

### 通过
- [x] 依赖方向正确
- [x] ...

### 注意（非阻塞）
- 描述
```

---

### 模式二：全量审查（用户主动要求）

**触发**：用户明确说"检查整个项目"、"全量 review"、"看看整体架构有没有问题"。
**范围**：整个项目，从宏观到微观，逐层深入。每一层发现问题就报告，由用户决定是否继续深入。

#### Level 1：架构全景（宏观）

目标：项目骨架是否合理、边界是否清晰。
> 读取 `01-structure.md` + `02-dependency.md`

- [ ] 目录结构是否符合分层架构定义
- [ ] Bounded Context 的划分是否合理（有没有职责模糊的 Context）
- [ ] 每个 Context 内的四层是否完整
- [ ] 跨 Context 是否存在代码级 import（扫描所有文件的 import）
- [ ] 跨 Context 通信方式是否正确（事件/API，不是直接调用）
- [ ] Aggregate 的边界是否合理（有没有过大或过小的 Aggregate）

**输出 Level 1 报告后暂停，问用户：是否继续深入到 Level 2？**

#### Level 2：层内契约（中观）

目标：每一层内部的接口定义、职责分配是否正确。
> 读取 `03-domain-layer.md` + `04-application-layer.md`

**领域层扫描：**
- [ ] 每个 Aggregate Root 是否有唯一标识
- [ ] Repository 是否只为 Root 建立（REPO-01）
- [ ] Value Object 是否全部 frozen（VO-01）
- [ ] Domain Event 是否全部 frozen + 过去式命名（EVT-01/02）
- [ ] Domain Service 是否无状态、是否真正跨 Aggregate（SVC-01/02）
- [ ] domain/ 是否有任何第三方 import（DEP-02）

**应用层扫描：**
- [ ] Handler 是否通过接口注入依赖（APP-01）
- [ ] Handler 是否只做编排（APP-02）——检查有无 if/else 业务逻辑
- [ ] 事件职责分配是否正确（领域层只产生、应用层编排发布）

**输出 Level 2 报告后暂停，问用户：是否继续深入到 Level 3？**

#### Level 3：实现语义（微观）

目标：具体代码是否符合 DDD 设计意图。
> 读取 `05-event-system.md` + `06-infra-and-naming.md`，同时逐项核对本文件的反模式清单

**逐文件深入：**
- [ ] Root 的业务方法是否校验不变量再修改状态（AGG-03）
- [ ] 是否存在贫血模型——Root 无业务方法（ANTI-20）
- [ ] 外部是否绕过 Root 直接改内部 Entity（ANTI-05）
- [ ] 一个事务中是否操作了多个 Aggregate（ANTI-07）
- [ ] 跨 Context 事件是否经过 Outbox（REL-01）
- [ ] 消费端是否幂等（REL-04）
- [ ] ACL 是否到位——Handler 入参是否为本 Context 类型（ANTI-22）
- [ ] Integration Event 是否与 Domain Event 分离（EVT-BUS-01）
- [ ] 命名是否符合规范

**输出完整的 Level 3 报告。**

#### 全量审查输出格式

```
## DDD 全量审查报告

### Level 1：架构全景
- [x] ...
- [ ] [规则编号] 问题描述

### Level 2：层内契约
- [x] ...
- [ ] [规则编号] 文件路径:行号 — 问题描述

### Level 3：实现语义
- [x] ...
- [ ] [规则编号] 文件路径:行号 — 问题描述

### 总结
- 关键问题：N 个
- 建议项：N 个
- 整体评估：一句话
```

---

## 附录：标准库白名单（domain 层可用）

```
dataclasses
typing
datetime
uuid
decimal
enum
abc
collections.abc
re（仅 Value Object 校验场景）
```
