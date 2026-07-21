# codeisall — 代码即一切知识的开发框架

基于 DDD 方法论，用 Python 装饰器定义**可执行规格**（领域模型），配合可视化看板、15 条 lint 规则、知识驱动测试、双 Reviewer 门禁。

> 人做架构师（结构正确 + 知识正确），AI 做建设者（写代码 + 写测试 + 验证）。

## 安装（团队，每人首次）

本仓库既是 marketplace（插件目录源）又是插件源。安装分三步，**一步都不能少**：

```text
/plugin marketplace add ssh://ezone.ksyun.com:23/ezone/codeisall/codeisall
/plugin install codeisall@codeisall
/reload-plugins
```

### 每步含义（理解了就不会漏）

**① `/plugin marketplace add <git地址>` — 注册"插件目录源"**
把本仓库 clone 到 `~/.claude/plugins/marketplaces/codeisall/`，告诉 Claude Code "这里有一个插件目录，里面有哪些插件可装"。
类比：登记一个应用商店的地址。**此步只是登记，插件还不可用，skills 不会出现。**

**② `/plugin install codeisall@codeisall` — 安装并启用插件**
把 `codeisall` 插件从 marketplace 拷贝安装到 `~/.claude/plugins/cache/codeisall/`，写进你的 settings（默认 user 级，跟人走），标记 enabled。
类比：从商店把 app 下载安装到本机。`@codeisall` 后半是 marketplace 名（本仓库插件与目录同名，故 `codeisall@codeisall`）。**装完插件已 enabled，但当前会话未必立刻看到 skills。**

**③ `/reload-plugins` — 当前会话热加载**
不重启会话，重新扫描已装插件的 skills/agents/hooks 并加载进当前会话。
类比：刷新桌面让新装 app 显示出来。**这步之后 `/codeisall:xxx` 才在当前会话可调。**

> 漏掉 ② 是最常见的坑：只做 ① + ③ 会出现 `Reloaded: 1 plugin · 0 skills`——插件加载了但 skill 数为 0，因为没有 install 到 cache。

### 安装后可用的 skill（均以 `codeisall:` 命名空间，用冒号不是点）

- `/codeisall:codeisall` — 主 skill，设计/实现/codeisall 全流程（内部 14 篇文档按需渐进披露）
- `/codeisall:domain-review` — 领域建模复审（设计阶段门禁，fork 进只读 Explore）
- `/codeisall:code-review` — 代码实现复审（实现阶段门禁，fork 进只读 Explore）
- `/codeisall:ddd-review` — DDD 建模与代码规范

> 注意：打 `/codeisall`（不带 `:skill名`）会找不到——本插件主 skill 在 `skills/codeisall/` 子目录下，必须带命名空间 `/codeisall:codeisall`。

## 更新（团队，每次源仓库有新提交后）

本插件**不设固定版本号**，以 git commit SHA 作为版本。每次推送到本仓库后，团队拉最新：

```text
/plugin marketplace update codeisall
```

此命令对已注册的 `codeisall` marketplace 重新 `git pull`，拉到最新 commit。**无需手动同步 skill 目录、无需重启会话**——因为省略 version，每次 commit 自动算新版本。

> 如果 update 后当前会话没立刻反映新内容，再 `/reload-plugins` 一次即可。

### 更新每步含义

**`/plugin marketplace update codeisall` — 刷新源**
对已注册的 `codeisall` marketplace 重新 `git pull`，拿到你 push 的最新 commit。类比：刷新商店货架看新货。更新的是 marketplace 源缓存；之后 `/reload-plugins` 让新内容进当前会话。

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
