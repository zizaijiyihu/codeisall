# codeisall — 代码即一切知识的开发框架

基于 DDD 方法论，用 Python 装饰器定义**可执行规格**（领域模型），配合可视化看板、15 条 lint 规则、知识驱动测试、双 Reviewer 门禁。

> 人做架构师（结构正确 + 知识正确），AI 做建设者（写代码 + 写测试 + 验证）。

## 安装（团队）

本仓库既是 marketplace 又是插件源。两步装好：

```text
/plugin marketplace add <本仓库 git 地址>
/plugin install codeisall@codeisall
/reload-plugins
```

安装后四个 skill 可用（均以 `codeisall:` 命名空间）：

- `/codeisall:codeisall` — 主 skill，设计/实现/codeisall 全流程
- `/codeisall:domain-review` — 领域建模复审（设计阶段门禁，fork 进只读 Explore）
- `/codeisall:code-review` — 代码实现复审（实现阶段门禁，fork 进只读 Explore）
- `/codeisall:ddd-review` — DDD 建模与代码规范

## 更新

本插件**不设固定版本号**，以 git commit SHA 作为版本。每次推送到本仓库，团队执行：

```text
/plugin marketplace update codeisall
```

即自动拉到最新 commit，无需手动同步 skill 目录、无需重启会话。

## 架构

```
.claude-plugin/marketplace.json          # marketplace 清单（本仓库根）
plugins/codeisall/
├── .claude-plugin/plugin.json           # 插件清单（无 version → git SHA 自动更新）
├── hooks/hooks.json                     # SessionStart：装 viewer 前端依赖到持久目录
├── scripts/install-viewer-deps.sh       # 依赖安装脚本
└── skills/
    ├── codeisall/                       # 主 skill + 14 篇文档 + ddd/ + scripts/ + viewer/ + example/
    ├── domain-review/                   # 领域建模复审 skill（fork → Explore）
    ├── code-review/                     # 代码实现复审 skill（fork → Explore）
    └── ddd-review/                      # DDD 规范 skill
```

看板服务由主 skill 内的 `scripts/codeisall.sh` 拉起：8502（API）+ 5171（前端）。详见主 skill 的 `01-server-and-api.md`。

## 本地开发测试

```bash
# 清单校验（不带 --strict）
claude plugin validate ./plugins/codeisall
# 唯一警告"未指定 version"是有意为之：省略 version → git commit SHA 自动作为版本，
# 团队每次 commit 自动更新、无需手动 bump。故不用 --strict（它会把这条意图性警告当错误）。

# 本地加载（不需安装到 marketplace）
claude --plugin-dir ./plugins/codeisall
```
