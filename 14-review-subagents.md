# 14 · 双 Reviewer 复审协议

> codeisall 有**两个**项目级 subagent，分别在不同阶段复审。
> 装饰器层面（建模）和 method body 层面（实现）由不同 Agent 把关。

## 两个 Reviewer 的分工

| | domain-reviewer | code-reviewer |
|---|---|---|
| **审什么** | 装饰器声明 / 领域建模合理性 | method body / 测试 / 依赖方向 |
| **何时跑** | 设计阶段（1-3）完成时 | 实现阶段（4-5）完成时 |
| **必须门禁** | 不过 → 不能进入实现阶段 | 不过 → 不能告诉用户"完成" |
| **依据清单** | 12-domain-review-checklist.md | 13-code-review-checklist.md |
| **不该看** | method body | 装饰器（除非验证 body 是否兑现契约） |

## 完整时序

```
阶段 1-3：写装饰器骨架（body=pass）
   ↓
主 Agent 自查（12-domain-review-checklist.md）
   ↓
启动 domain-reviewer 复审
   ↓
 阶段 4-5：填 body + 写测试
   ↓
主 Agent 自查（13-code-review-checklist.md）
   ↓
启动 code-reviewer 复审
   ↓
通过 → 告诉用户"完成"
```

**任一 reviewer 不过都不能进入下一阶段。**

## 安装协议（首次使用 codeisall 时自动执行）

主 Agent 在任何项目里第一次启动 codeisall 流程时，**必须同时安装 skill + 两个 subagent**：

```bash
PROJECT_DIR="<用户项目目录>"
PROJECT_SKILL="$PROJECT_DIR/.claude/skills/codeisall"
DOMAIN_REVIEWER="$PROJECT_DIR/.claude/agents/domain-reviewer.md"
CODE_REVIEWER="$PROJECT_DIR/.claude/agents/code-reviewer.md"

# Step 1: skill 整体安装
if [ ! -f "$PROJECT_SKILL/SKILL.md" ]; then
  mkdir -p "$PROJECT_DIR/.claude/skills"
  SKILL_SRC="$(寻找源 codeisall-skill 目录)"
  cp -r "$SKILL_SRC" "$PROJECT_SKILL"
fi

# Step 2: 两个 subagent 都装
mkdir -p "$PROJECT_DIR/.claude/agents"
NEED_RESTART=false
if [ ! -f "$DOMAIN_REVIEWER" ]; then
  cp "$PROJECT_SKILL/templates/domain-reviewer.md" "$DOMAIN_REVIEWER"
  NEED_RESTART=true
fi
if [ ! -f "$CODE_REVIEWER" ]; then
  cp "$PROJECT_SKILL/templates/code-reviewer.md" "$CODE_REVIEWER"
  NEED_RESTART=true
fi

# Step 3: 提醒用户重启
if [ "$NEED_RESTART" = "true" ]; then
  echo "✓ codeisall + 双 reviewer 已安装到项目"
  echo "  - skill: $PROJECT_SKILL"
  echo "  - domain-reviewer: $DOMAIN_REVIEWER"
  echo "  - code-reviewer: $CODE_REVIEWER"
  echo ""
  echo "⚠️  请重启 Claude Code 会话让 subagent 生效"
fi
```

## 启动方式

### 启动 domain-reviewer（设计阶段后）

```
通过 Task 工具：
  subagent_type: "domain-reviewer"
  description: "审查 <project> 的领域建模"
  prompt: """
    项目路径：<project_path>
    本次主 Agent 完成的设计：<ctx 数 / 聚合 / 不变量 / 业务规则>
    自查结果：lint 0 errors / 12-domain-review-checklist 全过
    请按 12-domain-review-checklist.md 独立审查。
  """
```

### 启动 code-reviewer（实现阶段后）

```
通过 Task 工具：
  subagent_type: "code-reviewer"
  description: "审查 <project> 的代码实现"
  prompt: """
    项目路径：<project_path>
    本次主 Agent 完成的实现：<body 填充 / 测试数 / handler 数>
    前置：domain-reviewer 已通过
    自查结果：lint 0 errors / pytest 全过 / 13-code-review-checklist 全过
    请按 13-code-review-checklist.md 独立审查。
  """
```

## 协作模式：pending-changes 通道

两个 reviewer 都写 `/api/pending-changes`，用 reason 前缀区分：

| Reviewer | reason 前缀 | 处理人 |
|---------|------------|--------|
| domain-reviewer | `[领域] ...` | 主 Agent 改装饰器 |
| code-reviewer | `[实现] ...` | 主 Agent 改 method body / 测试 |

## 迭代终止

| 迭代次数 | 处理 |
|---------|------|
| 1-3 轮 | 修复 → 再审 → 直到 0 问题 |
| > 3 轮 | 停止，输出"需要人工介入" |

**3 轮还修不完**，对 domain-reviewer 通常意味着设计本身有问题，对 code-reviewer 通常意味着实现方法不对。

## 何时跳过 reviewer

| 场景 | domain-reviewer | code-reviewer |
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
| 跳过 domain-reviewer 直接进实现 | 实现到一半发现建模有问题 → 大返工 |
| 主 Agent 自己审 = 复审 | 视角不独立，盲点查不到 |
| 一个 reviewer 同时审建模 + 实现 | 视角混乱，标准不清（上一版的问题） |

## 一句话总结

> **domain-reviewer = 设计门禁**：装饰器没过 → 不能进入实现
> **code-reviewer = 实现门禁**：代码没过 → 不能告诉用户"完成"
> 两个 reviewer 互不重叠、各司其职、依次把关。
