"""codeisall server — DDD 领域建模可视化 API

数据源优先级：
1. 若 EXAMPLE_DIR 环境变量指向一个项目目录（含 *_ctx/ 子目录），则每次请求实时
   从代码 AST 抽取（代码即文档）。
2. 否则回退到 viewer/demo_model.json。

目录结构（相对于 codeisall-skill/）：
  scripts/server.py      ← 本文件
  scripts/extract.py     ← AST 抽取器
  scripts/ddd_lint.py    ← lint 工具
  viewer/                ← 前端看板
  ddd/                   ← 装饰器库
  example/               ← 自带示例项目
"""
import json
import os
import sys
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="codeisall server")

# ============== 路径解析（基于 skill 目录结构）==============
SKILL_ROOT = Path(__file__).parent.parent  # codeisall-skill/
SCRIPTS_DIR = Path(__file__).parent        # codeisall-skill/scripts/
VIEWER_DIR = SKILL_ROOT / "viewer"
DIST_DIR = VIEWER_DIR / "dist"
MODEL_FILE = VIEWER_DIR / "demo_model.json"
PENDING_FILE = SKILL_ROOT / "pending_changes.json"  # codeisall: 待修改清单

# EXAMPLE_DIR：用户项目目录，默认用 skill 自带示例
EXAMPLE_DIR = Path(os.environ.get("EXAMPLE_DIR", SKILL_ROOT / "example"))
EXTRACTOR_AVAILABLE = False
LINTER_AVAILABLE = False
try:
    sys.path.insert(0, str(SCRIPTS_DIR))
    from extract import Extractor as _Extractor  # type: ignore
    EXTRACTOR_AVAILABLE = EXAMPLE_DIR.is_dir()
    try:
        from ddd_lint import Linter as _Linter  # type: ignore
        LINTER_AVAILABLE = EXAMPLE_DIR.is_dir()
    except Exception as _e:
        print(f"[warn] ddd-lint unavailable: {_e}", file=sys.stderr)
except Exception as _e:
    print(f"[warn] live extract unavailable: {_e}", file=sys.stderr)

with open(MODEL_FILE, encoding="utf-8") as f:
    DEMO_DATA = json.load(f)


@app.get("/api/model")
async def get_model():
    if EXTRACTOR_AVAILABLE:
        try:
            model = _Extractor(EXAMPLE_DIR).run()
            model.setdefault("annotations", DEMO_DATA.get("annotations", {}))
            return JSONResponse(model)
        except Exception as e:
            print(f"[err] extract failed, fallback to demo: {e}", file=sys.stderr)
    return JSONResponse(DEMO_DATA)


@app.get("/api/source")
async def get_source():
    """返回当前数据源信息（便于前端在 header 显示）"""
    return JSONResponse({
        "live": EXTRACTOR_AVAILABLE,
        "example_dir": str(EXAMPLE_DIR) if EXTRACTOR_AVAILABLE else None,
        "fallback_file": str(MODEL_FILE),
        "lint_enabled": LINTER_AVAILABLE,
    })


@app.get("/api/lint")
async def get_lint():
    """运行 ddd-lint，返回诊断 JSON。每次请求都重新跑（example/ 改了可立即看到）"""
    if not LINTER_AVAILABLE:
        return JSONResponse({"available": False, "diagnostics": [], "summary": {"errors": 0, "warnings": 0}})
    try:
        linter = _Linter(EXAMPLE_DIR)
        exit_code = linter.run()
        diagnostics = [d.to_dict() for d in linter.diagnostics]
        return JSONResponse({
            "available": True,
            "exit_code": exit_code,
            "diagnostics": diagnostics,
            "summary": {
                "errors": sum(1 for d in diagnostics if d["severity"] == "ERROR"),
                "warnings": sum(1 for d in diagnostics if d["severity"] == "WARN"),
                "infos": sum(1 for d in diagnostics if d["severity"] == "INFO"),
                "total_checks": {
                    "contexts": len(linter.model.get("contexts", [])),
                    "aggregates": sum(
                        1
                        for c in linter.model.get("contexts", [])
                        for a in c.get("aggregates", [])
                        if a.get("root")
                    ),
                    "relations": len(linter.model.get("relations", [])),
                    "events": len(linter.model.get("events", [])),
                    "business_rules": len(linter.model.get("business_rules", [])),
                },
            },
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"available": False, "error": str(e), "diagnostics": []})


@app.post("/api/annotate")
async def annotate(request: Request):
    body = await request.json()
    target_id = body.get("target_id", "")
    text = body.get("text", "")
    author = body.get("author", "匿名")
    DEMO_DATA["annotations"][target_id] = {
        "text": text,
        "author": author,
    }
    return JSONResponse({"status": "ok"})


# ============== codeisall: 待修改清单 ==============
# 数据契约（每条记录）：
# {
#   "node_id": "order__Order",          # 看板节点 id（root: ctx_id__name; entity/VO 同；svc: ctx_id__svc__name; ctx-bg: ctx-bg-{id}）
#   "change_type": "modify"|"add"|"remove"|"conflict",
#   "reason": "需要新增不变量：库存不足时拒单",   # 给人看的简短解释
#   "prompt_hint": "在 order_ctx/domain/order.py:30 的 Order 类上加 @invariant(...)",  # 可选，给 Claude 改代码时参考
#   "source_location": {"file": "...", "line": 30}  # 可选，由 Claude 从 /api/model 推算填入
# }
# 设计原则：
# - 持久化到 PENDING_FILE（不放内存），保证 server 重启或 Claude 多次调用后看板仍然能反映
# - 没有 schema 校验之外的服务端逻辑：这就是个 KV，由 Claude 写、前端读
# - 提供 PUT (覆盖) 和 PATCH (追加/合并) 两种语义；DELETE 清空


def _read_pending() -> list[dict]:
    if not PENDING_FILE.exists():
        return []
    try:
        with open(PENDING_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_pending(items: list[dict]):
    with open(PENDING_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


@app.get("/api/pending-changes")
async def get_pending():
    return JSONResponse({"items": _read_pending()})


@app.put("/api/pending-changes")
async def put_pending(request: Request):
    """覆盖式：用 body.items 完整替换当前清单。Claude 完成一轮分析后调用。"""
    body = await request.json()
    items = body.get("items", [])
    if not isinstance(items, list):
        return JSONResponse({"status": "error", "message": "items must be a list"}, status_code=400)
    _write_pending(items)
    return JSONResponse({"status": "ok", "count": len(items)})


@app.patch("/api/pending-changes")
async def patch_pending(request: Request):
    """追加/合并式：按 node_id 合并 body.items 到现有清单（同 node_id 覆盖）。"""
    body = await request.json()
    new_items = body.get("items", [])
    if not isinstance(new_items, list):
        return JSONResponse({"status": "error", "message": "items must be a list"}, status_code=400)
    existing = _read_pending()
    by_id = {it.get("node_id"): it for it in existing if it.get("node_id")}
    for it in new_items:
        nid = it.get("node_id")
        if nid:
            by_id[nid] = it
    merged = list(by_id.values())
    _write_pending(merged)
    return JSONResponse({"status": "ok", "count": len(merged)})


@app.delete("/api/pending-changes")
async def clear_pending():
    """清空：完成代码修改并验证通过后调用。"""
    _write_pending([])
    return JSONResponse({"status": "ok"})


if DIST_DIR.exists() and os.environ.get("SERVE_FRONTEND") == "1":
    # 仅当显式声明 SERVE_FRONTEND=1 时才托管 dist/
    # 默认 dev 模式（5171 vite dev）下，8502 只提供 /api，避免老 dist/ 与新源码混淆
    @app.get("/", response_class=HTMLResponse)
    async def index():
        return HTMLResponse((DIST_DIR / "index.html").read_text(encoding="utf-8"))

    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8502)
