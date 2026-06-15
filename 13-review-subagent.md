# 13 · 子 Agent 复审协议

> 主 Agent 自查通过后，调用项目级 subagent `code-reviewer` 用同一份 skill 独立复审。
> 双重保障：主 Agent 生成时遵循规则 + 子 Agent 生成后独立审查。

## 为什么需要子 Agent

```
主 Agent：
  - 优化目标：把活干完
  - 风险：可能为了完成而省略规范
  - 盲点：自己写的代码自己看不出问题

子 Agent（code-reviewer）：
  - 优化目标：找问题
  - 视角独立，无"赶进度"压力
  - 跟主 Agent 读同一份 skill → 标准一致
```

## 安装协议（第一次使用 codeisall 时自动执行）

**Claude 在用 codeisall 的第一时刻，必须检查并安装 code-reviewer subagent。**

### 触发条件

主 Agent 在任何项目里第一次启动 codeisall 流程时：
- 用户说"帮我设计 XX 系统"
- 用户说"做个 XX agent"
- 用户说"加 XX 功能"
- 任何触发 codeisall skill 的场景

### 安装步骤（主 Agent 必须执行）

```bash
# Step 1: 检查目标项目是否已有 code-reviewer subagent
PROJECT_DIR="<用户项目目录>"
SUBAGENT_FILE="$PROJECT_DIR/.claude/agents/code-reviewer.md"

if [ ! -f "$SUBAGENT_FILE" ]; then
  # Step 2: 不存在 → 自动安装
  mkdir -p "$PROJECT_DIR/.claude/agents"

  # codeisall skill 自带 subagent 模板
  SKILL_DIR="$(找到 codeisall skill 安装目录)"
  cp "$SKILL_DIR/templates/code-reviewer.md" "$SUBAGENT_FILE"

  # Step 3: 通知用户重启
  echo "✓ 已在 $PROJECT_DIR/.claude/agents/code-reviewer.md 安装 codeisall 复审子 agent"
  echo ""
  echo "⚠️  请重启 Claude Code 会话让 subagent 生效（关闭当前会话，重新打开）"
  echo ""
  echo "重启后 codeisall 完整流程才能闭环（生成 → 自查 → 子 agent 复审）。"
fi
```

### 找 skill 安装目录

```python
# codeisall skill 可能在两个位置（按优先级）：
# 1. ~/.claude/skills/codeisall/        ← 用户已安装的 skill
# 2. <项目根>/codeisall-skill/          ← 开发期或仓库自带
```

### 安装后必须做的事

1. **明确告诉用户**：已安装 subagent + 需要重启
2. **本次会话继续正常工作**（subagent 暂时不可用，但主 Agent 仍能完成任务）
3. **本次会话结束前**：再次提醒用户重启

## 启动复审（重启后可用）

### 调用方式

主 Agent 完成代码生成 + 自查通过后：

```
通过 Task 工具调用 subagent_type='code-reviewer' 启动复审：

  description: "复审 <project> 的 codeisall 代码"
  prompt: """
    项目路径：<project_path>
    本次主 Agent 完成的工作：<简述>
    自查结果：lint 0 errors / pytest 全过 / 清单 10/10 通过

    请你按 codeisall skill 独立审查。
  """
  subagent_type: "code-reviewer"
```

### 子 Agent 内部行为

子 Agent 收到任务后，自动按 `templates/code-reviewer.md` 定义的流程：
1. 读 codeisall skill
2. 跑 lint + pytest
3. 拉 /api/model
4. 核对 12-self-review-checklist.md 10 类清单
5. 重点查主 Agent 盲点
6. 发现问题 → PATCH /api/pending-changes
7. 输出结构化报告

## 主 Agent 拿到复审结果后

```
子 Agent 报告 0 问题：
  → 告诉用户"完成"

子 Agent 报告 N 个问题：
  → 看 pending-changes 红标
  → 按 reason 逐条修复
  → DELETE 已修复的 pending 条目
  → 再次启动子 Agent 复审
  → 迭代到 0 问题
```

## 迭代终止条件

| 迭代次数 | 处理 |
|---------|------|
| 1-3 轮 | 修复 → 再审 → 直到 0 问题 |
| > 3 轮 | 停止，输出"需要人工介入" |

3 轮还修不完，通常说明**设计本身有问题**（不是单点修复能解决的），需要回到设计阶段。

## 何时跳过复审

| 场景 | 复审 |
|------|------|
| 完整流程（设计 → 实现 → 测试） | ✅ 必须 |
| 增量改动 1-2 个文件 | ⚠️ 建议 |
| 微小改动（typo / 注释） | ❌ 跳过 |
| 重构（多文件） | ✅ 必须 |
| 用户明确说"先跑起来不审了" | ❌ 跳过（记日志）|

## 与 pending-changes 的协同

```
主 Agent：写代码 → 自查 → 通过
                              ↓
子 Agent：独立审查 → 发现问题 → PATCH pending-changes（看板标红）
                              ↓
主 Agent：看到红标 → 按 reason 修 → 修完 DELETE 对应条目
                              ↓
                       再次启动子 Agent
                              ↓
                          0 问题 → 完成
```

**看板成为两个 Agent 的协作界面**。人不读代码，只看看板红标。

## 项目级 subagent 配置

subagent 文件位置：

```
<project>/.claude/agents/code-reviewer.md
```

**这是项目级**（不是全局），原因：
- 不同项目可以有不同的复审策略
- 可 commit 到 git，团队共享
- 跟项目代码绑定，clone 项目就有

## 一句话总结

> **首次进入项目**：检查 `.claude/agents/code-reviewer.md` → 不存在就 copy + 提醒重启
> **完整流程结束**：自查通过 → 启动 code-reviewer → 0 问题才告诉用户"完成"
> **看板红标**：两个 Agent 协作的可视化界面，人只看这个
