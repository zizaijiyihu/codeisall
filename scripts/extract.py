#!/usr/bin/env python3
"""DDD 代码 → model.json 抽取器

用法:
    python scripts/extract.py example/ > generated_model.json

工作原理:
1. 递归扫描 example/ 下所有 .py 文件
2. 用 ast 模块解析，找出装饰器调用并提取字面量参数
3. 把元数据组织成 model.json 结构（与现有前端兼容）
4. 自动反推：
   - relations 从 @event_handler 反推
   - events.trigger 从源码中的 bus.publish(...) 调用反推
   - code_structure 从目录树推导
"""

from __future__ import annotations
import ast
import json
import sys
from pathlib import Path
from collections import defaultdict
from typing import Any


# ============== AST 工具 ==============

def literal(node: ast.AST) -> Any:
    """把 AST 节点转成 Python 字面量；不支持的就抛错"""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.List):
        return [literal(e) for e in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(literal(e) for e in node.elts)
    if isinstance(node, ast.Dict):
        return {literal(k): literal(v) for k, v in zip(node.keys, node.values)}
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -literal(node.operand)
    if isinstance(node, ast.Attribute):
        # 形如 Position.Left → 还原成 "Position.Left" 字符串
        parts = []
        cur = node
        while isinstance(cur, ast.Attribute):
            parts.append(cur.attr); cur = cur.value
        if isinstance(cur, ast.Name):
            parts.append(cur.id)
        return ".".join(reversed(parts))
    if isinstance(node, ast.Name):
        return node.id
    raise ValueError(f"装饰器参数不是字面量: {ast.dump(node)}")


def decorator_call_name(dec: ast.AST) -> str | None:
    """提取装饰器的 name (例如 @aggregate_root(...) → 'aggregate_root')"""
    if isinstance(dec, ast.Call):
        return decorator_call_name(dec.func)
    if isinstance(dec, ast.Name):
        return dec.id
    if isinstance(dec, ast.Attribute):
        return dec.attr
    return None


def decorator_kwargs(dec: ast.AST) -> dict:
    """提取装饰器的 kwargs 字面量"""
    if not isinstance(dec, ast.Call):
        return {}
    out = {}
    for kw in dec.keywords:
        try:
            out[kw.arg] = literal(kw.value)
        except ValueError as e:
            raise ValueError(f"装饰器 {decorator_call_name(dec)} 参数 {kw.arg} 不是字面量: {e}")
    return out


def get_attributes_from_class(cls: ast.ClassDef, source_lines: list[str]) -> list[dict]:
    """从 @dataclass 的 AnnAssign 提取属性 + 行内注释作为 description"""
    attrs = []
    for stmt in cls.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            name = stmt.target.id
            type_str = ast.unparse(stmt.annotation) if stmt.annotation else ""
            # 行内注释 → description
            line_idx = stmt.lineno - 1
            line = source_lines[line_idx] if 0 <= line_idx < len(source_lines) else ""
            desc = ""
            if "#" in line:
                desc = line.split("#", 1)[1].strip()
            attrs.append({"name": name, "type": type_str, "description": desc})
    return attrs


def is_dataclass_frozen(cls: ast.ClassDef) -> bool:
    for dec in cls.decorator_list:
        if isinstance(dec, ast.Call):
            name = decorator_call_name(dec)
            if name == "dataclass":
                for kw in dec.keywords:
                    if kw.arg == "frozen" and isinstance(kw.value, ast.Constant) and kw.value.value:
                        return True
        elif decorator_call_name(dec) == "dataclass":
            return False
    return False


def find_publish_calls_in_function(func: ast.FunctionDef) -> list[str]:
    """扫描函数体内的 bus.publish('XXX', ...) 调用，返回事件名列表"""
    events = []
    for node in ast.walk(func):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and node.func.attr == "publish":
            if node.args and isinstance(node.args[0], ast.Constant):
                events.append(node.args[0].value)
    return events


# ============== 主提取流程 ==============

class Extractor:
    def __init__(self, root_dir: Path):
        self.root = root_dir
        # 收集的中间数据
        self.contexts_meta: dict[str, dict] = {}          # ctx_id -> bounded_context meta
        self.terms: dict[str, list] = defaultdict(list)   # ctx_id -> [terms]
        self.aggregate_roots: dict[str, list[dict]] = defaultdict(list)
        # 每个 entry: { name, description, attributes, invariants, commands }
        # invariants/commands 按聚合精确归属
        self.entities: dict[str, list] = defaultdict(list)
        self.value_objects: dict[str, list] = defaultdict(list)
        self.invariants: dict[str, list] = defaultdict(list)   # 仅作为 fallback，新逻辑用 aggregate_roots[i].invariants
        self.commands: dict[str, list] = defaultdict(list)     # 同上 fallback
        self.entity_methods: dict[tuple, list] = defaultdict(list)  # (ctx_id, entity_name) -> [methods]
        self.event_handlers: list[dict] = []              # 每个 handler 含 ctx_id + meta
        self.business_rules: list[dict] = []
        self.shared_infra: list[dict] = []
        self.domain_services: dict[str, list] = defaultdict(list)  # ctx_id -> [services]
        self.events_published: dict[str, str] = {}        # event_name -> "AggregateRoot.method"
        self.agents: list[dict] = []                         # agent 定义列表
        self.test_verifications: list[dict] = []               # @verifies / @verifies_command 声明

    def run(self) -> dict:
        for py_file in sorted(self.root.rglob("*.py")):
            if "__pycache__" in py_file.parts:
                continue
            self._process_file(py_file)
        return self._build_model()

    # ---------- 文件处理 ----------

    def _process_file(self, path: Path):
        source = path.read_text(encoding="utf-8")
        source_lines = source.splitlines()
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError:
            return

        rel = path.relative_to(self.root)
        rel_str = str(rel)
        # 推断当前文件所在的 context_id（顶层目录 xxx_ctx → xxx）
        ctx_id = self._infer_context_id(rel)

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                self._process_class(node, ctx_id, source_lines, rel_str)
                # 扫描 class 内部的方法（测试方法带 @verifies 在 class 里）
                for stmt in node.body:
                    if isinstance(stmt, ast.FunctionDef):
                        self._process_function(stmt, ctx_id, rel_str)
            elif isinstance(node, ast.FunctionDef):
                self._process_function(node, ctx_id, rel_str)

    def _infer_context_id(self, rel: Path) -> str | None:
        top = rel.parts[0] if rel.parts else ""
        if top.endswith("_ctx"):
            return top[:-4]
        # agents/ 目录不属于任何 bounded context
        if top == "agents":
            return None
        return None

    # ---------- 类处理 ----------

    def _process_class(self, cls: ast.ClassDef, ctx_id: str | None, source_lines: list[str], file_rel: str = ""):
        decorators = self._collect_decorators(cls)

        for kind, kwargs, dec_line in decorators:
            src_loc = {"file": file_rel, "line": dec_line}
            if kind == "bounded_context":
                self.contexts_meta[kwargs["id"]] = {**kwargs, "source_location": src_loc}
            elif kind == "term":
                cid = kwargs.get("__ctx__") or ctx_id
                self.terms[cid].append({
                    "term": kwargs["term"],
                    "definition": kwargs.get("definition", ""),
                    "confusion": kwargs.get("confusion", ""),
                    "source_location": src_loc,
                })
            elif kind == "routing_rule":
                pass  # 已废弃：codeisall 回归 DDD 原概念，去掉自创的 routing_rule
            elif kind == "not_responsible":
                pass  # 已废弃：信息合并到 @bounded_context.responsibility 文本里
            elif kind == "aggregate_root":
                cid = kwargs["context"]
                # 在聚合根类内同时收集本聚合的 invariants 和 commands
                inv_list, cmd_list = [], []
                for stmt in cls.body:
                    if not isinstance(stmt, ast.FunctionDef):
                        continue
                    for dec in stmt.decorator_list:
                        dname = decorator_call_name(dec)
                        if dname == "invariant":
                            try:
                                ikw = decorator_kwargs(dec)
                            except ValueError:
                                continue
                            inv_list.append({
                                "description": ikw.get("description", ""),
                                "formal": ikw.get("formal", ""),
                                "fields": ikw.get("fields", []),
                                "source_location": {"file": file_rel, "line": dec.lineno},
                            })
                        elif dname == "command":
                            try:
                                ckw = decorator_kwargs(dec)
                            except ValueError:
                                continue
                            args = [a.arg for a in stmt.args.args if a.arg != "self"]
                            sig = f"{stmt.name}({', '.join(args)})"
                            cmd_list.append({
                                "name": sig,
                                "precondition": ckw.get("pre", ""),
                                "operation": ckw.get("operation", ""),
                                "postcondition": ckw.get("post", ""),
                                "event": ckw.get("emits", "无"),
                                "not_do": ckw.get("not_do", ""),
                                "failure": ckw.get("fails", ""),
                                "source_location": {"file": file_rel, "line": dec.lineno},
                            })
                            # 反推 events.trigger（聚合根类名 + 方法名）
                            for evt in find_publish_calls_in_function(stmt):
                                self.events_published[evt] = f"{cls.name}.{stmt.name}()"
                self.aggregate_roots[cid].append({
                    "name": cls.name,
                    "description": kwargs.get("description", ""),
                    "attributes": get_attributes_from_class(cls, source_lines),
                    "invariants": inv_list,
                    "commands": cmd_list,
                    "source_location": src_loc,
                })
            elif kind == "entity":
                cid = kwargs["context"]
                entity_meta = {
                    "name": cls.name,
                    "description": kwargs.get("description", ""),
                    "attributes": get_attributes_from_class(cls, source_lines),
                    "methods": self._collect_entity_methods(cls, file_rel),
                    "source_location": src_loc,
                }
                self.entities[cid].append(entity_meta)
            elif kind == "value_object":
                cid = kwargs["context"]
                constraints = self._collect_vo_constraints(cls)
                self.value_objects[cid].append({
                    "name": cls.name,
                    "description": kwargs.get("description", ""),
                    "attributes": get_attributes_from_class(cls, source_lines),
                    "constraints": constraints,
                    "frozen": is_dataclass_frozen(cls) or kwargs.get("frozen", True),
                    "source_location": src_loc,
                })
            elif kind == "not_responsible_for":
                pass  # 已废弃：聚合级边界信息合并到 @event_handler.label / data_flow
            elif kind == "business_rule":
                # 类级 @business_rule（旧用法，标记为 orphan，让 lint 报错）
                br = {**kwargs, "source_location": src_loc, "enforced_by": None}
                # 兼容旧字段
                if "aggregate" in kwargs and "involves" not in kwargs:
                    br["involves"] = [kwargs["aggregate"]]
                self.business_rules.append(br)
            elif kind == "domain_service":
                cid = kwargs["context"]
                # 收集类内的 public 方法作为 service 的 operations
                methods = []
                for stmt in cls.body:
                    if isinstance(stmt, ast.FunctionDef) and not stmt.name.startswith("_"):
                        args = [a.arg for a in stmt.args.args if a.arg != "self"]
                        sig = f"{stmt.name}({', '.join(args)})"
                        ret = ast.unparse(stmt.returns) if stmt.returns else ""
                        doc = ast.get_docstring(stmt) or ""
                        methods.append({
                            "name": sig,
                            "returns": ret,
                            "description": doc.split("\n", 1)[0] if doc else "",
                            "source_location": {"file": file_rel, "line": stmt.lineno},
                        })
                self.domain_services[cid].append({
                    "name": cls.name,
                    "description": kwargs.get("description", ""),
                    "operates_on": kwargs.get("operates_on", []),
                    "methods": methods,
                    "source_location": src_loc,
                })
            elif kind == "shared_infrastructure":
                # 推断文件路径
                self.shared_infra.append({**kwargs, "_path_hint": True, "source_location": src_loc})
            elif kind == "anticorruption_layer":
                # 暂不渲染，预留
                pass
            elif kind == "agent":
                # Agent 定义：收集 tools 和 constraints 需要后续从类内装饰器获取
                agent_entry = {
                    "id": kwargs.get("id", ""),
                    "name": kwargs.get("name", ""),
                    "type": kwargs.get("type", ""),
                    "framework": kwargs.get("framework", ""),
                    "description": kwargs.get("description", ""),
                    "triggers": kwargs.get("triggers", []),
                    "operates_on": kwargs.get("operates_on", []),
                    "tools": [],
                    "skills": [],
                    "cli": [],
                    "constraints": [],
                    "source_location": src_loc,
                }
                # 收集类级别的 @agent_constraint / @agent_tool / @agent_skill / @agent_cli
                for other_kind, other_kwargs, _ in decorators:
                    if other_kind == "agent_constraint":
                        agent_entry["constraints"].append(other_kwargs.get("rule", ""))
                    elif other_kind == "agent_tool":
                        tool_entry = {
                            "name": other_kwargs.get("name", ""),
                            "description": other_kwargs.get("description", ""),
                            "direction": other_kwargs.get("direction", ""),
                        }
                        if "target_ctx" in other_kwargs:
                            tool_entry["target_ctx"] = other_kwargs["target_ctx"]
                        if "data_source" in other_kwargs:
                            tool_entry["data_source"] = other_kwargs["data_source"]
                        if "source" in other_kwargs:
                            tool_entry["source"] = other_kwargs["source"]
                        agent_entry["tools"].append(tool_entry)
                    elif other_kind == "agent_skill":
                        agent_entry["skills"].append({
                            "name": other_kwargs.get("name", ""),
                            "description": other_kwargs.get("description", ""),
                            "path": other_kwargs.get("path", ""),
                        })
                    elif other_kind == "agent_cli":
                        agent_entry["cli"].append({
                            "command": other_kwargs.get("command", ""),
                            "args": other_kwargs.get("args", []),
                            "description": other_kwargs.get("description", ""),
                        })
                        agent_entry["tools"].append(tool_entry)
                # 收集类内方法上的 @agent_tool 和 @agent_constraint
                for stmt in cls.body:
                    if not isinstance(stmt, ast.FunctionDef):
                        continue
                    for inner_dec in stmt.decorator_list:
                        inner_name = decorator_call_name(inner_dec)
                        if inner_name == "agent_tool":
                            try:
                                tkw = decorator_kwargs(inner_dec)
                            except ValueError:
                                continue
                            tool_entry = {
                                "name": tkw.get("name", stmt.name),
                                "description": tkw.get("description", ""),
                                "direction": tkw.get("direction", ""),
                            }
                            if "target_ctx" in tkw:
                                tool_entry["target_ctx"] = tkw["target_ctx"]
                            if "data_source" in tkw:
                                tool_entry["data_source"] = tkw["data_source"]
                            agent_entry["tools"].append(tool_entry)
                        elif inner_name == "agent_constraint":
                            try:
                                ckw = decorator_kwargs(inner_dec)
                            except ValueError:
                                continue
                            agent_entry["constraints"].append(ckw.get("rule", ""))
                self.agents.append(agent_entry)

    def _collect_decorators(self, cls: ast.ClassDef) -> list[tuple[str, dict, int]]:
        out = []
        for dec in cls.decorator_list:
            name = decorator_call_name(dec)
            if not name:
                continue
            try:
                kwargs = decorator_kwargs(dec)
            except ValueError:
                continue
            out.append((name, kwargs, dec.lineno))
        return out

    def _collect_vo_constraints(self, cls: ast.ClassDef) -> list[str]:
        constraints = []
        for dec in cls.decorator_list:
            if decorator_call_name(dec) == "vo_constraint" and isinstance(dec, ast.Call):
                if dec.args and isinstance(dec.args[0], ast.Constant):
                    constraints.append(dec.args[0].value)
        return constraints

    def _collect_aggregate_methods(self, cls: ast.ClassDef, ctx_id: str):
        """[已废弃] invariants/commands 现在在 _process_class 里直接挂到对应聚合"""
        pass

    def _collect_entity_methods(self, cls: ast.ClassDef, file_rel: str = "") -> list[dict]:
        methods = []
        for stmt in cls.body:
            if not isinstance(stmt, ast.FunctionDef) or stmt.name.startswith("_"):
                continue
            args = [a.arg for a in stmt.args.args if a.arg != "self"]
            sig = f"{stmt.name}({', '.join(args)})"
            doc = ast.get_docstring(stmt) or ""
            pre, post = "", ""
            for line in doc.splitlines():
                if "precondition" in line.lower():
                    pre = line.split(":", 1)[-1].strip()
                if "postcondition" in line.lower():
                    post = line.split(":", 1)[-1].strip()
            methods.append({
                "name": sig,
                "description": doc.split("\n", 1)[0] if doc else "",
                "precondition": pre,
                "postcondition": post,
                "source_location": {"file": file_rel, "line": stmt.lineno},
            })
        return methods

    # ---------- 函数处理（event_handler）----------

    def _process_function(self, func: ast.FunctionDef, ctx_id: str | None, file_rel: str = ""):
        for dec in func.decorator_list:
            name = decorator_call_name(dec)
            if name == "event_handler":
                kwargs = decorator_kwargs(dec)
                self.event_handlers.append({
                    "to_context": ctx_id,
                    "from_context": kwargs["from_context"],
                    "event": kwargs["event"],
                    "relation_type": kwargs.get("relation_type", "customer-supplier"),
                    "integration": kwargs.get("integration", "event"),
                    "label": kwargs.get("label", ""),
                    "data_flow": kwargs.get("data_flow", ""),
                    "failure_strategy": kwargs.get("failure_strategy", ""),
                    "handler_name": func.name,
                    "source_location": {"file": file_rel, "line": dec.lineno},
                })
            elif name == "verifies":
                try:
                    kwargs = decorator_kwargs(dec)
                except ValueError:
                    continue
                self.test_verifications.append({
                    "type": "invariant",
                    "invariant": kwargs.get("invariant", ""),
                    "context": kwargs.get("context", ""),
                    "aggregate": kwargs.get("aggregate", ""),
                    "test_name": func.name,
                    "source_location": {"file": file_rel, "line": func.lineno},
                })
            elif name == "verifies_command":
                try:
                    kwargs = decorator_kwargs(dec)
                except ValueError:
                    continue
                self.test_verifications.append({
                    "type": "command",
                    "command": kwargs.get("command", ""),
                    "aspect": kwargs.get("aspect", ""),
                    "context": kwargs.get("context", ""),
                    "aggregate": kwargs.get("aggregate", ""),
                    "test_name":func.name,
                    "source_location": {"file": file_rel, "line": func.lineno},
                })
            elif name == "business_rule":
                # @business_rule 装在 @event_handler 函数上：守护代码就是这个 handler
                try:
                    kwargs = decorator_kwargs(dec)
                except ValueError:
                    continue
                has_event_handler = any(
                    decorator_call_name(d) == "event_handler" for d in func.decorator_list
                )
                self.business_rules.append({
                    **kwargs,
                    "source_location": {"file": file_rel, "line": dec.lineno},
                    "enforced_by": f"{ctx_id}.{func.name}" if has_event_handler else None,
                    "enforced_by_type": "event_handler" if has_event_handler else "orphan_function",
                })

    # ---------- 最终组装 ----------

    def _build_model(self) -> dict:
        contexts = []
        for ctx_id, meta in self.contexts_meta.items():
            agg_list = self.aggregate_roots.get(ctx_id, [])
            if not agg_list:
                # 该 Context 暂无聚合根，保留占位（兼容前端）
                aggs = [{
                    "id": f"{ctx_id}_agg",
                    "name": ctx_id,
                    "root": None,
                    "entities": [],
                    "value_objects": [],
                    "domain_services": [],
                    "not_belong": [],
                    "invariants": [],
                    "methods": [],
                }]
            else:
                aggs = []
                for i, ar in enumerate(agg_list):
                    # 第一个聚合获得 ctx 级共享元数据（entities/VOs/services/not_responsible）
                    # 实际 DDD：entity/VO 应明确归属，这里先用启发式
                    is_primary = (i == 0)
                    aggs.append({
                        "id": f"{ctx_id}_{ar['name']}_agg",
                        "name": ar["name"],
                        "root": {
                            "name": ar["name"],
                            "attributes": ar["attributes"],
                            "source_location": ar.get("source_location"),
                        },
                        "entities": self.entities.get(ctx_id, []) if is_primary else [],
                        "value_objects": self.value_objects.get(ctx_id, []) if is_primary else [],
                        "domain_services": self.domain_services.get(ctx_id, []) if is_primary else [],
                        "not_belong": [],
                        "invariants": ar["invariants"],
                        "methods": ar["commands"],
                        "source_location": ar.get("source_location"),
                    })
            contexts.append({
                "id": ctx_id,
                "name": meta["name"],
                "type": meta["type"],
                "type_rationale": meta.get("type_rationale", ""),
                "responsibility": meta["responsibility"],
                "ubiquitous_language": self.terms.get(ctx_id, []),
                "aggregates": aggs,
                "source_location": meta.get("source_location"),
            })

        # 反推 relations：每个 event_handler → 一条 relation
        relations = []
        for h in self.event_handlers:
            relations.append({
                "from": h["from_context"],
                "to": h["to_context"],
                "relation_type": h["relation_type"],
                "integration": h["integration"],
                "event": h["event"],
                "label": h["label"],
                "data_flow": h["data_flow"],
                "failure_strategy": h["failure_strategy"],
                "source_location": h.get("source_location"),
            })

        # 反推 events 目录：从 events_published + handlers 聚合
        events_by_name: dict[str, dict] = {}
        for evt_name, trigger in self.events_published.items():
            events_by_name.setdefault(evt_name, {
                "name": evt_name, "trigger": trigger, "fields": [],
                "consumers": [], "non_consumers": [],
            })
        for h in self.event_handlers:
            ev = events_by_name.setdefault(h["event"], {
                "name": h["event"], "trigger": "", "fields": [],
                "consumers": [], "non_consumers": [],
            })
            # 找下游"主"聚合根（多聚合时用第一个）
            agg_list = self.aggregate_roots.get(h["to_context"], [])
            agg_root = agg_list[0] if agg_list else None
            ev["consumers"].append({
                "context": h["to_context"],
                "aggregate": agg_root["name"] if agg_root else h["to_context"],
                "method": h["handler_name"],
                "action": h["label"],
            })

        # 共享基础设施 — 给出 path
        shared = []
        # 重新扫描 shared/ 找到每个文件
        shared_root = self.root / "shared"
        if shared_root.exists():
            for py_file in shared_root.rglob("*.py"):
                if py_file.name == "__init__.py":
                    continue
                rel_path = py_file.relative_to(self.root)
                source = py_file.read_text(encoding="utf-8")
                try:
                    tree = ast.parse(source)
                except SyntaxError:
                    continue
                for node in ast.iter_child_nodes(tree):
                    if isinstance(node, ast.ClassDef):
                        for dec in node.decorator_list:
                            if decorator_call_name(dec) == "shared_infrastructure":
                                kw = decorator_kwargs(dec)
                                shared.append({
                                    "id": kw["id"],
                                    "name": kw["name"],
                                    "icon": kw.get("icon", ""),
                                    "kind": kw.get("kind", ""),
                                    "description": kw.get("description", ""),
                                    "path": str(rel_path),
                                })

        # 推导 code_structure
        code_structure = self._build_code_structure()

        return {
            "contexts": contexts,
            "relations": relations,
            "events": list(events_by_name.values()),
            "business_rules": self.business_rules,
            "domain_distribution": self._build_distribution(),
            "annotations": {},
            "shared_infrastructure": shared,
            "code_structure": code_structure,
            "agents": self.agents,
            "test_coverage": self.test_verifications,
        }

    def _build_distribution(self) -> dict:
        core, supporting, generic = [], [], []
        for cid, meta in self.contexts_meta.items():
            t = meta["type"]
            if t == "core": core.append(cid)
            elif t == "supporting": supporting.append(cid)
            elif t == "generic": generic.append(cid)
        return {
            "core": core, "core_principle": "核心域投入最多建模精力",
            "supporting": supporting, "supporting_principle": "保证正确即可",
            "generic": generic, "generic_principle": "用成熟方案/第三方服务",
        }

    def _build_code_structure(self) -> dict:
        out = {}
        for ctx_dir in sorted(self.root.glob("*_ctx")):
            ctx_id = ctx_dir.name[:-4]
            layers = {}
            for layer_name in ("api", "application", "domain", "infrastructure"):
                # infrastructure 目录可能叫 infra
                actual = layer_name
                layer_dir = ctx_dir / layer_name
                if not layer_dir.exists() and layer_name == "infrastructure":
                    layer_dir = ctx_dir / "infra"
                    actual = "infra"
                if not layer_dir.exists():
                    continue
                files = []
                for py_file in sorted(layer_dir.rglob("*.py")):
                    if py_file.name == "__init__.py":
                        continue
                    rel = py_file.relative_to(layer_dir)
                    desc = self._first_docstring(py_file)
                    files.append({
                        "name": str(rel),
                        "desc": desc,
                        **self._maps_to_for_file(py_file, ctx_id),
                    })
                layers[layer_name] = {"dir": f"{actual}/", "files": files}
            out[ctx_id] = {"root": f"{ctx_dir.name}/", "layers": layers}
        return out

    def _first_docstring(self, py_file: Path) -> str:
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
            doc = ast.get_docstring(tree)
            return doc.split("\n", 1)[0] if doc else ""
        except Exception:
            return ""

    def _maps_to_for_file(self, py_file: Path, ctx_id: str) -> dict:
        """若文件含 @aggregate_root/@entity/@value_object 装饰的类，记录 maps_to"""
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            return {}
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                for dec in node.decorator_list:
                    n = decorator_call_name(dec)
                    if n in ("aggregate_root", "entity", "value_object"):
                        return {"maps_to": node.name}
        return {}


# ============== CLI ==============

def main():
    if len(sys.argv) < 2:
        print("用法: extract.py <project_dir>", file=sys.stderr)
        sys.exit(1)
    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"错误: {root} 不是目录", file=sys.stderr)
        sys.exit(1)
    extractor = Extractor(root)
    model = extractor.run()
    json.dump(model, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
