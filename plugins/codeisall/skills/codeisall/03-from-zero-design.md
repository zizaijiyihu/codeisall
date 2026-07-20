# 03 · 从零开始设计一个新系统

> 触发：用户说 "帮我设计 XX 系统的 DDD" / "做个 XX 的领域建模" / "从头建个 XX"
> 目标：通过装饰器骨架代码 + 看板渲染，做出可被审阅、可演进、可直接落地实现的设计。

## 核心原则

1. **不写 design.json / design.md** —— 装饰器代码就是设计文档
2. **先战略，后战术，最后实现** —— 三个阶段都用同一份代码，逐渐丰满
3. **每一步看板要可见** —— 写完一段装饰器立刻让用户在看板上看到效果
4. **设计阶段 method body 全是 pass** —— 不在没设计完之前写实现

## 完整流程

### 第 0 步：明确目录与启动 server

询问用户：
- 项目放哪个目录？（默认在用户当前工作目录新建 `{name}-ddd/`）
- 这个项目跟已有项目有关联吗？（如果是 `ddd-python/example/` 的扩展，就用现有目录）

初始化目录结构：

```bash
mkdir -p {project}/ddd
cp /Users/xiaohu/projects/DDD/ddd-python/ddd/*.py {project}/ddd/
touch {project}/__init__.py
```

启动 server（指定项目目录）：

```bash
cd /Users/xiaohu/projects/DDD/ddd-viewer-react
EXAMPLE_DIR=/path/to/{project} python3 -m uvicorn server:app --port 8502 &
```

确认 `curl http://localhost:8502/api/source` 返回 `live: true`，并提示用户打开 http://localhost:5171/ 看空看板。

### 第 1 步：业务域发现（对话，不写代码）

跟用户讨论：

- 这个系统的业务流程是什么？（顺着流程走一遍）
- 涉及哪些角色 / 子系统 / 外部依赖？
- 有哪些"动作"（创建 / 提交 / 审批 / 通知 / 归档 等）？
- 哪些是核心 / 哪些是支撑 / 哪些可以用现成方案？

输出（口头讨论，不落代码）：
- 子域清单（含每个的类型：core / supporting / generic）
- 子域之间的依赖关系草图

**这一步可以参考 `${CLAUDE_PLUGIN_ROOT}/skills/ddd-review/08-strategic-modeling.md` 的产出物规格。**

### 第 2 步：战略层装饰器（写 manifest.py）

对每个 Context 写 `{ctx_id}_ctx/manifest.py`：

```python
"""<ctx_name> Context"""
from ddd.decorators import bounded_context, term


@bounded_context(
    id="<ctx_id>",
    name="<中文名>",
    type="core | supporting | generic",
    type_rationale="为什么是这个类型（一句话）",
    responsibility="本 Context 负责什么（一句话，要明确边界）",
)
@term(term="<术语1>", definition="<定义>", confusion="<跟什么混淆>")
@term(term="<术语2>", ...)
class <CtxName>Context:
    pass
```

**这一步要写 3 类核心信息**：
1. 至少 3-5 个统一语言术语（especially 易混淆的）
2. responsibility 写得精确 + 必要时明说"不做什么"
3. 跨 ctx 协作通过事件 + ACL 翻译（@event_handler）

写完一个 ctx 后，**让用户刷新看板**，应该出现 ctx 框 + "等待战术设计" 占位节点。

### 第 3 步：战术层 — 聚合根（写 domain/*.py）

对每个聚合根写 `{ctx_id}_ctx/domain/{root_name}.py`：

```python
"""<RootName> 聚合根"""
from dataclasses import dataclass
from ddd.decorators import aggregate_root, invariant, command


@aggregate_root(context="<ctx_id>", description="<一句话职责>")
@dataclass
class <RootName>:
    # 属性（用 dataclass 风格，加行内注释作为 description）
    id: str  # 主键
    status: str  # draft / submitted / archived
    # ...

    @invariant(
        description="<人类可读的不变量描述>",
        formal="<形式化表达，如 status='approved' → frozen>",
        fields=["status", "..."],  # 涉及哪些属性
    )
    def _inv_<name>(self): pass

    @command(
        emits="<EventName>",
        pre="<前置条件>",
        post="<后置状态>",
        fails="<可能的失败原因>",
        operation="<操作描述（可选）>",
    )
    def <action_name>(self, ...): pass
```

**指标参考（来自 `${CLAUDE_PLUGIN_ROOT}/skills/ddd-review/09-tactical-modeling.md`）**：
- 每个聚合根至少 1 条不变量（贫血聚合会被 lint 警告）
- 每个聚合根至少 1 个 @command（仅有属性的聚合是数据载体不是聚合）
- 不变量描述用业务语言，formal 用类似数学表达

### 第 4 步：战术层 — 值对象 / 实体 / 领域服务

按需写 `{ctx_id}_ctx/domain/value_objects.py`、`entities/*.py`、`services/*.py`：

```python
# value_objects.py
from dataclasses import dataclass
from ddd.decorators import value_object, vo_constraint

@value_object(context="<ctx_id>")
@vo_constraint("金额必须非负")
@vo_constraint("精度最多 2 位小数")
@dataclass(frozen=True)
class Money:
    amount: Decimal  # 金额数值
    currency: str  # 货币代码（ISO 4217）
```

```python
# services/{service}.py（跨聚合协作时才需要）
from ddd.decorators import domain_service

@domain_service(
    context="<ctx_id>",
    description="<服务职责>",
    operates_on=["<Root1>", "<Root2>"],  # 协作的聚合根
)
class <ServiceName>:
    def <method>(self, ...): pass
```

### 第 5 步：跨 Context 事件 / 集成

对每个跨 Context 事件消费者写 `{ctx_id}_ctx/application/handlers/on_{event}.py`：

```python
"""响应 <Event> 事件"""
from ddd.decorators import event_handler


@event_handler(
    event="<EventName>",
    from_context="<上游 ctx_id>",
    relation_type="customer-supplier | conformist | anticorruption-layer | ...",
    integration="event | api | shared-db",
    label="<一句话说明此 handler 做什么>",
    data_flow="<数据流动描述>",
    failure_strategy="<失败处理：重试 / 死信 / 人工 / 等>",
)
def on_<event>(payload):
    pass
```

写完后看板出现跨 Context 事件边。

### 第 6 步：业务规则（可选，但推荐）

把"业务部门给的硬规则"沉淀到 `business_rules.py`：

```python
"""业务规则索引（含溯源）"""
from ddd.decorators import business_rule


@business_rule(
    rule="<规则描述>",
    source="<来源：文档 / 会议 / 邮件 / 法规等>",
    aggregate="<生效在哪个聚合根>",
    timing="<什么时机校验>",
)
class <RuleName>: pass
```

### 第 7 步：设计审阅与迭代

每完成一个 Context 的设计，调用：
- `GET /api/lint` 检查 0 errors
- 提示用户在看板上检查

**典型反馈循环**：
- "这个不变量应该放在另一个聚合"
- "这个事件应该是 customer-supplier 不是 conformist"
- "这个术语易混淆描述不够清楚"

每条反馈对应一次 Edit + 重拉验证。

### 第 8 步：进入实现阶段

设计稳定后跟用户确认："是否进入实现？"

实现阶段做的事：
- 填充 method body（聚合根的 command 方法的真实逻辑）
- 加 `infrastructure/repository.py`（Repository 实现）
- 加 `infrastructure/publisher.py`（事件发布）
- 加 `interface/`（HTTP / 命令行接口）

**装饰器不动** —— 看板呈现的内容在设计完成时已经定稿。

## 反模式

| ❌ 反模式 | 后果 |
|----------|------|
| 跳过战略层直接写聚合 | Context 边界模糊，将来很难拆 |
| 不写 ubiquitous_language | 不同 Context 同名概念产生歧义 |
| @invariant 描述用代码逻辑（如 `if status == ...`） | 看板上读不懂，违反"业务语言"原则 |
| 一个聚合根 10+ 个属性 | 边界过宽，应当拆分 |
| 跨 Context 直接 import | 违反铁律 4，必须事件化 |
| 设计阶段填写 method body | 实现细节污染设计 |

## 完成检查清单（设计阶段结束前）

- [ ] 每个 Context 有 manifest.py，含 type_rationale + responsibility
- [ ] 每个 Context 至少 3 个 @term，明确边界 / 易混淆点
- [ ] 每个聚合根至少 1 个 @invariant 和 1 个 @command
- [ ] 跨 Context 通信全部用 @event_handler，无 import
- [ ] `GET /api/lint` 返回 0 errors
- [ ] 看板上每个节点都能讲出自己的"为什么"（用户能复述）
- [ ] 用户对当前设计明确说"OK"

只有全打勾才进入实现阶段。
