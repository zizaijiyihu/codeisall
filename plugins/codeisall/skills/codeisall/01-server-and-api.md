# 01 · Server 与 API 契约

## 端口约定（铁律）

| 端口 | 谁访问 | 提供什么 |
|------|--------|---------|
| **5171** | **人**（浏览器唯一入口） | vite dev server，渲染最新源码，HMR 实时生效 |
| **8502** | **Claude**（API 调用）+ vite proxy | FastAPI，提供 `/api/*`，不托管前端 |

**用户永远只访问 http://localhost:5171/**。8502 上不会渲染看板（默认情况下 8502 上 `/` 返回 404）。

vite 已配置 proxy：`5171/api/*` 自动转发到 `8502/api/*`。所以前端代码里 `fetch('/api/model')` 走的是同源 5171。

### 为什么 8502 默认不托管前端？

避免新老前端混淆：`dist/` 是过期构建（要 `vite build` 才更新），而 5171 永远是最新源码。如果 8502 同时托管 dist/，用户在 8502 看到的是历史版本，跟 Claude 看到的不一致，制造排查噪音。

如果确实需要 8502 提供前端（生产部署、没装 node 的机器），显式开启：

```bash
SERVE_FRONTEND=1 python3 -m uvicorn server:app --port 8502
# 同时记得跑 npx vite build 更新 dist/
```

两个端口都被记忆固化（避免不同会话用不同端口）。

## 启动流程

### 标准启动（dev 模式：双进程）

```bash
# 进程 1：后端 server（端口 8502，只提供 /api）
cd <codeisall-skill>/scripts
EXAMPLE_DIR=/path/to/your-project python3 -m uvicorn server:app --port 8502 \
    --reload --reload-dir . &

# 进程 2：前端 dev server（端口 5171，HMR）
cd <codeisall-skill>/viewer
npx vite &
```

`--reload --reload-dir .` 让 uvicorn 监听 `scripts/` 下的 .py 改动自动重启。
**不加这个 flag 的话，改 `extract.py` / `codeisall_lint.py` / `server.py` 必须手动 `kill $(lsof -ti :8502)` 重启。**
`reload-dir` 限定为 `.`（即 scripts 目录），不会被 example/ 业务代码改动触发误重启。

两个进程都要起。用户访问 **http://localhost:5171/**。

如果只用 codeisall 自带的 `example/`：

```bash
cd <codeisall-skill>/scripts
python3 -m uvicorn server:app --port 8502 --reload --reload-dir . &
cd <codeisall-skill>/viewer && npx vite &
```

### 切项目（重启 server 改 EXAMPLE_DIR）

```bash
# 杀掉旧 server
kill $(lsof -ti :8502)

# 用新 EXAMPLE_DIR 启动
cd <codeisall-skill>/scripts
EXAMPLE_DIR=/path/to/new-project python3 -m uvicorn server:app --port 8502 \
    --reload --reload-dir . &
```

vite (5171) 不用动 —— 它通过 proxy 自动跟新 server 通信。

### 健康检查（**两个端口都要活**）

> **铁律：前端 5171 + 后端 8502 必须同时活着，缺一不可。**
> 任何动作前先查这两个端口，不要假设它们还在跑。

```bash
# 一次性查两个端口
curl -sf -o /dev/null -w "5171(前端): %{http_code}\n" http://localhost:5171/ && \
curl -sf -o /dev/null -w "8502(后端): %{http_code}\n" http://localhost:8502/api/source

# 期望输出：
#   5171(前端): 200
#   8502(后端): 200
```

后端详细健康（`/api/source`）返回：

```json
{
  "live": true,                       // 是否成功连接 extract.py（活的模型）
  "example_dir": "/path/to/project",  // 当前扫描的代码目录
  "fallback_file": "/path/to/demo_model.json",  // live=false 时的回退
  "lint_enabled": true                // 是否能跑 codeisall-lint
}
```

### 故障矩阵（必须按这个判断，不要乱猜）

| 5171 | 8502 | 现象 | 处理 |
|---|---|---|---|
| ❌ 000 | ✅ 200 | 用户访问看板 → "无法连接" | 启动 vite：`cd <codeisall-skill>/viewer && nohup npx vite > /tmp/codeisall-vite.log 2>&1 &` |
| ✅ 200 | ❌ 000 | 看板能开但永远转圈/空 | 启动 server：`cd <codeisall-skill>/scripts && EXAMPLE_DIR=... nohup python3 -m uvicorn server:app --port 8502 --reload --reload-dir . > /tmp/codeisall-api.log 2>&1 &` |
| ❌ 000 | ❌ 000 | 全挂 | 两个都起 |
| ✅ 200 | `live: false` | 看板有数据但是 demo（不是用户项目） | 检查 EXAMPLE_DIR 路径；检查 extract.py import |

### 进程托管纪律

- **必须用 `nohup ... &`** 启动，不要前台跑（被 shell 退出会带走进程）
- **必须重定向到 `/tmp/codeisall-{api,vite}.log`**，故障时直接看这两个文件
- 重启后端时 vite 容易被连带杀掉（同 shell 子进程组），重启 API 后**立即 curl 5171 验证**，没了就重启 vite
- 切项目（改 EXAMPLE_DIR）时只重启后端，**不要碰 vite**

`--reload --reload-dir .` 让 uvicorn 监听 `scripts/` 下的 .py 改动自动重启，
**所以改 `extract.py` / `codeisall_lint.py` / `server.py` 不用手动 kill。**
但改完 0.5 秒内重新 curl 8502 验证 reload 成功（如果文件有语法错，reload 会失败导致 server 死掉）。

## API 列表

### `GET /api/model`

返回当前代码库的 DDD 模型（实时 AST 抽取，无缓存）。

返回结构：

```json
{
  "contexts": [
    {
      "id": "order",
      "name": "订单",
      "type": "core",
      "type_rationale": "...",
      "responsibility": "...",
      "ubiquitous_language": [{ "term": "...", "definition": "...", "confusion": "..." }],
      "aggregates": [
        {
          "id": "order_Order_agg",
          "name": "Order",
          "root": {
            "name": "Order",
            "attributes": [{ "name": "...", "type": "...", "description": "..." }],
            "source_location": { "file": "order_ctx/domain/order.py", "line": 30 }
          },
          "entities": [...],
          "value_objects": [...],
          "domain_services": [...],
          "invariants": [{ "description": "...", "formal": "...", "fields": [...], "source_location": {...} }],
          "methods": [{ "name": "place()", "precondition": "...", "postcondition": "...", "event": "...", "source_location": {...} }],
          "source_location": {...}
        }
      ],
      "source_location": {...}
    }
  ],
  "relations": [
    { "from": "order", "to": "payment", "event": "OrderPlaced", "relation_type": "customer-supplier", "integration": "event", "source_location": {...} }
  ],
  "events": [...],
  "business_rules": [...],
  "shared_infrastructure": [...],
  "code_structure": {...}
}
```

**`source_location` 是关键字段** —— 每个节点都带 `{file: 相对路径, line: 装饰器所在行}`，让 Claude 改代码时精确定位。

### `GET /api/lint`

跑 `codeisall_lint.py`，返回诊断结果。

```json
{
  "available": true,
  "exit_code": 0,
  "diagnostics": [
    { "rule_id": "...", "severity": "ERROR|WARN|INFO", "message": "...", "location": {...} }
  ],
  "summary": {
    "errors": 0,
    "warnings": 2,
    "total_checks": {
      "contexts": 4,
      "aggregates": 5,
      "relations": 6,
      "events": 4,
      "business_rules": 3
    }
  }
}
```

**改完代码必须跑这个**。规则清单见 `ddd-python/README.md` 的 "codeisall-lint 规则清单" 段。

### `GET / PUT / PATCH / DELETE /api/pending-changes`

待修改清单（codeisall 的核心交互通道）。详见 `05-pending-changes-protocol.md`。

| 方法 | 语义 |
|------|------|
| `GET` | 拉当前清单 |
| `PUT` | 覆盖式：用 body.items 完整替换 |
| `PATCH` | 合并式：按 node_id 合并到现有清单 |
| `DELETE` | 清空（验证全部通过后调用） |

请求 / 返回示例（PUT）：

```bash
curl -X PUT http://localhost:8502/api/pending-changes \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "node_id": "order__Order",
        "change_type": "modify",
        "reason": "新增不变量：库存不足时拒单",
        "prompt_hint": "在 order_ctx/domain/order.py:30 给 Order 类加 @invariant(...)",
        "source_location": { "file": "order_ctx/domain/order.py", "line": 30 }
      }
    ]
  }'

# 返回
{ "status": "ok", "count": 1 }
```

### `POST /api/annotate`

给节点加临时注解（不入装饰器代码）。当前主要供前端使用，skill 流程很少用。

---

## EXAMPLE_DIR 的目录约定

任何项目（教学示例 `ddd-python/example/`、自建项目）都要遵循下面的目录结构，否则 extract.py 抽不出来：

```
your-project/
├── ddd/                            # 从 ddd-python/ddd/ 复制（装饰器库）
│   ├── __init__.py
│   └── decorators.py
├── {ctx_id_1}_ctx/                 # 每个 Context 一个目录，目录名必须以 _ctx 结尾
│   ├── __init__.py
│   ├── manifest.py                 # 战略层装饰器（@bounded_context, @term）
│   ├── domain/                     # 战术层：聚合、实体、值对象、领域服务
│   │   ├── __init__.py
│   │   ├── {root_name}.py          # @aggregate_root（每个聚合一个文件）
│   │   ├── value_objects.py        # @value_object
│   │   └── services/
│   │       └── {service_name}.py   # @domain_service
│   └── application/
│       └── handlers/
│           └── on_{event}.py       # @event_handler
├── {ctx_id_2}_ctx/
│   └── ...
├── shared/                         # 跨 ctx 共享的纯技术能力
│   └── *.py                        # @shared_infrastructure
```

**目录命名约定**：
- Context 目录必须 `{id}_ctx`（如 `order_ctx`、`weekly_report_ctx`）
- 分层目录用 `interface | application | domain | infrastructure`（infra 是缩写）

## Server 行为说明

- 每次 `GET /api/model` **都重新 AST 抽取**，无缓存。改完代码立即生效（前端 3 秒轮询）
- `pending-changes` 持久化到 `ddd-viewer-react/pending_changes.json`，server 重启不丢
- live 模式失败时回退到 `demo_model.json`（教学样例，可读但不可代表用户真实项目）

## 常见故障

| 现象 | 排查 |
|------|------|
| `live: false` | 检查 EXAMPLE_DIR 路径；检查 `ddd-python/scripts/extract.py` 是否能 import |
| `/api/model` 返回空 contexts | 检查目录名是否带 `_ctx` 后缀；检查 manifest.py 是否有 `@bounded_context` |
| `/api/lint` returns `available: false` | 检查 `ddd-python/codeisall_lint.py` 是否能 import |
| 看板某节点没出现 | 检查装饰器参数是否字面量（违反会被静默丢弃） |
