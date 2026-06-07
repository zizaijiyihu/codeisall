#!/usr/bin/env python3
"""codeisall-lint：对 DDD Python 项目做静态质检

用法:
    python3 scripts/codeisall_lint.py <project_dir>
    python3 scripts/codeisall_lint.py <project_dir> --json

退出码: 0 = 无 error，1 = 有 error
"""

from __future__ import annotations
import ast
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from collections import defaultdict
from typing import Iterable

# 把 scripts/ 加入 sys.path 以复用 Extractor
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "scripts"))
from extract import Extractor, decorator_call_name, decorator_kwargs  # type: ignore


# ============== 诊断数据 ==============

SEVERITY_RANK = {"ERROR": 2, "WARN": 1, "INFO": 0}


@dataclass
class Diagnostic:
    severity: str          # ERROR / WARN / INFO
    rule: str              # 规则 id (kebab-case)
    file: str              # 相对路径
    line: int              # 行号
    message: str           # 主消息
    hint: str = ""         # 修复建议

    def to_dict(self):
        return {
            "severity": self.severity, "rule": self.rule,
            "file": self.file, "line": self.line,
            "message": self.message, "hint": self.hint,
        }


# ============== 规则注册表 ==============

RULES: list = []


def rule(rule_id: str):
    """装饰器：把函数注册为一条规则"""
    def decorator(fn):
        fn.rule_id = rule_id
        RULES.append(fn)
        return fn
    return decorator


# ============== Linter 主体 ==============

class Linter:
    def __init__(self, project_dir: Path):
        self.root = project_dir
        self.diagnostics: list[Diagnostic] = []
        # 通过 Extractor 收集元数据
        self.extractor = Extractor(project_dir)
        self.model = self.extractor.run()
        # 自己再扫一遍，记录每条元数据的精确位置（class/function lineno）
        self.locations: dict[str, list[tuple]] = defaultdict(list)
        self._scan_locations()

    def _scan_locations(self):
        """扫描所有 .py 文件，收集每个装饰器所在的位置和元数据"""
        for py_file in sorted(self.root.rglob("*.py")):
            if "__pycache__" in py_file.parts:
                continue
            try:
                src = py_file.read_text(encoding="utf-8")
                tree = ast.parse(src)
            except SyntaxError:
                continue
            rel = str(py_file.relative_to(self.root))

            def record(node, src):
                for dec in node.decorator_list:
                    name = decorator_call_name(dec)
                    if not name:
                        continue
                    try:
                        kw = decorator_kwargs(dec)
                    except ValueError:
                        kw = {}
                    lineno = getattr(dec, "lineno", node.lineno)
                    self.locations[name].append({
                        "file": rel, "line": lineno,
                        "kwargs": kw, "owner": node.name,
                        "node": node, "src": src,
                    })

            # 顶层节点（class / function）
            for top in ast.iter_child_nodes(tree):
                if isinstance(top, (ast.ClassDef, ast.FunctionDef)):
                    record(top, src)
                # 类内部的方法（@invariant / @command 在这里）
                if isinstance(top, ast.ClassDef):
                    for stmt in top.body:
                        if isinstance(stmt, ast.FunctionDef):
                            record(stmt, src)

    def emit(self, severity: str, rule_id: str, file: str, line: int,
             message: str, hint: str = ""):
        self.diagnostics.append(
            Diagnostic(severity, rule_id, file, line, message, hint)
        )

    def run(self) -> int:
        for rule_fn in RULES:
            rule_fn(self)
        return 0 if not any(d.severity == "ERROR" for d in self.diagnostics) else 1


# ============== 控制台输出 ==============

USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None
COLORS = {
    "RED": "\033[31m", "YELLOW": "\033[33m", "GREEN": "\033[32m",
    "DIM": "\033[2m", "BOLD": "\033[1m", "RESET": "\033[0m",
}
def C(name: str) -> str:
    return COLORS[name] if USE_COLOR else ""


def print_diagnostics(diagnostics: list[Diagnostic], summary_extra: str = ""):
    diagnostics.sort(key=lambda d: (-SEVERITY_RANK[d.severity], d.file, d.line))
    n_err = sum(1 for d in diagnostics if d.severity == "ERROR")
    n_warn = sum(1 for d in diagnostics if d.severity == "WARN")

    for d in diagnostics:
        sev_color = "RED" if d.severity == "ERROR" else "YELLOW"
        print(f"{C(sev_color)}{C('BOLD')}{d.severity:5}{C('RESET')} "
              f"{C('DIM')}[{d.rule}]{C('RESET')} "
              f"{d.file}:{d.line}")
        for line in d.message.splitlines():
            print(f"      {line}")
        if d.hint:
            print(f"{C('GREEN')}      ↳ {d.hint}{C('RESET')}")
        print()

    sep = "─" * 60
    print(sep)
    if summary_extra:
        print(summary_extra)
    if n_err == 0 and n_warn == 0:
        print(f"{C('GREEN')}{C('BOLD')}✓ 全部通过：0 errors, 0 warnings{C('RESET')}")
    else:
        err_str = f"{C('RED')}{n_err} errors{C('RESET')}" if n_err else "0 errors"
        warn_str = f"{C('YELLOW')}{n_warn} warnings{C('RESET')}" if n_warn else "0 warnings"
        print(f"总结：{err_str}, {warn_str}")
        if n_err > 0:
            print(f"{C('RED')}❌ 不允许 commit，请先修复 errors{C('RESET')}")
        elif n_warn > 0:
            print(f"{C('YELLOW')}⚠ 可以 commit，但建议尽快修复 warnings{C('RESET')}")


# ============== 规则实现 ==============

@rule("business-rule-no-owner")
def check_business_rule_owner(linter: Linter):
    """Rule 1：每条 @business_rule 必须有承接的聚合根"""
    aggregate_names = {item["owner"] for item in linter.locations.get("aggregate_root", [])}
    for loc in linter.locations.get("business_rule", []):
        kw = loc["kwargs"]
        target = kw.get("aggregate")
        if not target:
            linter.emit("ERROR", "business-rule-no-owner", loc["file"], loc["line"],
                f'@business_rule "{kw.get("rule", loc["owner"])}" 缺少 aggregate= 字段',
                hint="给 @business_rule 添加 aggregate=\"<聚合根类名>\"")
            continue
        if target not in aggregate_names:
            linter.emit("ERROR", "business-rule-no-owner", loc["file"], loc["line"],
                f'业务规则 "{kw.get("rule", "")}" 引用了 aggregate="{target}"，\n'
                f'但代码中没有任何 @aggregate_root 声明叫 {target}。\n'
                f'这条业务规则没有承接者，是悬空规则。',
                hint=f'要么实现 {target} 聚合根，要么删除这条规则')


@rule("aggregate-root-no-invariant")
def check_aggregate_has_invariant(linter: Linter):
    """Rule 2：聚合根至少要有 1 条 @invariant"""
    # 收集每个聚合根类下的 invariant 数量
    inv_per_class: dict[str, int] = defaultdict(int)
    for loc in linter.locations.get("invariant", []):
        # @invariant 装饰的是聚合根类内部的方法，owner 是 method 名
        # 我们通过 src 解析它所属的 class
        src = loc["src"]
        try:
            tree = ast.parse(src)
        except SyntaxError:
            continue
        for cls in ast.walk(tree):
            if isinstance(cls, ast.ClassDef):
                for stmt in cls.body:
                    if isinstance(stmt, ast.FunctionDef) and stmt.name == loc["owner"]:
                        inv_per_class[cls.name] += 1

    for loc in linter.locations.get("aggregate_root", []):
        cls_name = loc["owner"]
        if inv_per_class.get(cls_name, 0) == 0:
            linter.emit("WARN", "aggregate-root-no-invariant", loc["file"], loc["line"],
                f"聚合根 {cls_name} 没有声明任何 @invariant。\n"
                f"一个没有不变量的聚合根 = 贫血模型 = 退化成 CRUD。",
                hint=f"思考 {cls_name} 在创建/修改时必须始终满足什么业务规则，加 @invariant")


@rule("invariant-field-not-exist")
def check_invariant_fields(linter: Linter):
    """Rule 3：@invariant 里的 fields 必须是聚合根的属性"""
    # 先建立 聚合根类名 → 属性集合 的索引
    cls_attrs: dict[str, set[str]] = {}
    for loc in linter.locations.get("aggregate_root", []):
        # 从 owner 类中提取 AnnAssign 字段
        attrs = set()
        for stmt in loc["node"].body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                attrs.add(stmt.target.id)
        cls_attrs[loc["owner"]] = attrs

    for loc in linter.locations.get("invariant", []):
        fields = loc["kwargs"].get("fields", [])
        if not fields:
            continue
        # 找该方法所属的 class
        owning_cls = None
        try:
            tree = ast.parse(loc["src"])
            for cls in ast.walk(tree):
                if isinstance(cls, ast.ClassDef):
                    for stmt in cls.body:
                        if isinstance(stmt, ast.FunctionDef) and stmt.name == loc["owner"]:
                            owning_cls = cls.name
        except SyntaxError:
            continue

        if not owning_cls or owning_cls not in cls_attrs:
            continue
        attrs = cls_attrs[owning_cls]

        for f in fields:
            # 嵌套字段（含 . 或 []）只检查根字段
            base = f.split(".")[0].split("[")[0]
            if base not in attrs:
                linter.emit("ERROR", "invariant-field-not-exist",
                    loc["file"], loc["line"],
                    f'@invariant 引用了字段 "{f}"，但 {owning_cls} 类的属性中没有 "{base}"。\n'
                    f'类的实际属性: {sorted(attrs)}',
                    hint=f"字段名拼写错误，或这个不变量已过时需要删除")


@rule("event-no-consumer")
def check_event_no_consumer(linter: Linter):
    """Rule 5：被发布的事件至少要有 1 个消费者，或显式 @non_consumer_of"""
    published = set(linter.extractor.events_published.keys())
    consumed = {h["event"] for h in linter.extractor.event_handlers}
    explicit_non = set()
    for loc in linter.locations.get("non_consumer_of", []):
        ev = loc["kwargs"].get("event")
        if ev:
            explicit_non.add(ev)

    # 找出 publish 调用的具体位置
    publish_locations: dict[str, tuple[str, int]] = {}
    for py_file in sorted(linter.root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        try:
            src = py_file.read_text(encoding="utf-8")
            tree = ast.parse(src)
        except SyntaxError:
            continue
        rel = str(py_file.relative_to(linter.root))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                    and node.func.attr == "publish":
                if node.args and isinstance(node.args[0], ast.Constant):
                    evt = node.args[0].value
                    if evt not in publish_locations:
                        publish_locations[evt] = (rel, node.lineno)

    for evt in published:
        if evt in consumed or evt in explicit_non:
            continue
        file, line = publish_locations.get(evt, ("?", 0))
        linter.emit("WARN", "event-no-consumer", file, line,
            f'事件 "{evt}" 被发布，但：\n'
            f'  - 没有任何 @event_handler 消费它\n'
            f'  - 也没有 @non_consumer_of 显式声明"故意不消费"',
            hint=f'要么实现消费者，要么用 @non_consumer_of(event="{evt}", reason="...") 明确声明')


@rule("cross-context-import")
def check_cross_context_import(linter: Linter):
    """Rule 6：context A 不能直接 import context B"""
    for py_file in sorted(linter.root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = py_file.relative_to(linter.root)
        rel_str = str(rel)
        parts = rel.parts
        if not parts or not parts[0].endswith("_ctx"):
            continue
        my_ctx = parts[0]
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            module = None
            line = getattr(node, "lineno", 0)
            if isinstance(node, ast.ImportFrom) and node.module:
                module = node.module
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    self_check_import_module(linter, rel_str, line, alias.name, my_ctx)
                continue
            if module:
                self_check_import_module(linter, rel_str, line, module, my_ctx)


def self_check_import_module(linter: Linter, file: str, line: int, module: str, my_ctx: str):
    top = module.split(".")[0]
    if top.endswith("_ctx") and top != my_ctx:
        linter.emit("ERROR", "cross-context-import", file, line,
            f"不允许跨 Context import：\n"
            f"  本文件属于 {my_ctx}，却 import 了 {top}.*\n"
            f"Context 之间只能通过事件 / ACL 解耦",
            hint=f"通过事件 payload 获得数据，或在 {my_ctx}/infra/acl/ 下实现 ACL 翻译器")


@rule("shared-reverse-import")
def check_shared_reverse_import(linter: Linter):
    """Rule 7：shared/ 不能 import 任何 _ctx"""
    shared_root = linter.root / "shared"
    if not shared_root.exists():
        return
    for py_file in sorted(shared_root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = str(py_file.relative_to(linter.root))
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            module = None
            line = getattr(node, "lineno", 0)
            if isinstance(node, ast.ImportFrom) and node.module:
                module = node.module
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0].endswith("_ctx"):
                        linter.emit("ERROR", "shared-reverse-import", rel, line,
                            f"shared/ 不允许 import 任何业务 Context\n"
                            f"  发现: import {alias.name}",
                            hint="shared 只能放零业务语义的纯技术能力")
                continue
            if module and module.split(".")[0].endswith("_ctx"):
                linter.emit("ERROR", "shared-reverse-import", rel, line,
                    f"shared/ 不允许 import 任何业务 Context\n"
                    f"  发现: from {module} import ...",
                    hint="shared 只能放零业务语义的纯技术能力")


@rule("routing-keyword-conflict")
def check_routing_keyword_conflict(linter: Linter):
    """Rule 8：同一个 keyword 不能 belongs 多个 Context"""
    keyword_owners: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for loc in linter.locations.get("routing_rule", []):
        kw = loc["kwargs"]
        keyword = kw.get("keyword")
        belongs = kw.get("belongs")
        if keyword and belongs:
            keyword_owners[keyword].append((belongs, loc["file"], loc["line"]))

    for keyword, owners in keyword_owners.items():
        belongs_set = {o[0] for o in owners}
        if len(belongs_set) > 1:
            for belongs, file, line in owners:
                linter.emit("ERROR", "routing-keyword-conflict", file, line,
                    f'路由关键词 "{keyword}" 冲突：\n'
                    f"  同时被声明 belongs 多个 Context: {sorted(belongs_set)}",
                    hint="一个业务关键词只能归属一个 Context（统一语言）")


@rule("aggregate-root-no-command")
def check_aggregate_has_command(linter: Linter):
    """Rule 9（额外）：聚合根至少要有 1 个 @command（避免贫血模型）"""
    cmd_per_class: dict[str, int] = defaultdict(int)
    for loc in linter.locations.get("command", []):
        try:
            tree = ast.parse(loc["src"])
        except SyntaxError:
            continue
        for cls in ast.walk(tree):
            if isinstance(cls, ast.ClassDef):
                for stmt in cls.body:
                    if isinstance(stmt, ast.FunctionDef) and stmt.name == loc["owner"]:
                        cmd_per_class[cls.name] += 1

    for loc in linter.locations.get("aggregate_root", []):
        cls_name = loc["owner"]
        if cmd_per_class.get(cls_name, 0) == 0:
            linter.emit("WARN", "aggregate-root-no-command", loc["file"], loc["line"],
                f"聚合根 {cls_name} 没有任何 @command 方法。\n"
                f"没有行为的聚合根 = 贫血模型，业务逻辑必然散落到 application 层",
                hint="把状态变更的方法用 @command 装饰起来")


# ============== Domain Service 规则 ==============

_TECH_NAMES = ('Manager', 'Helper', 'Util', 'Utils', 'Handler', 'Processor')


@rule("domain-service-must-cross-aggregates")
def check_service_cross_aggregates(linter: Linter):
    """Rule：@domain_service 的 operates_on 至少应有 2 个聚合
    否则该行为应归入那个唯一的聚合（避免贫血模型）"""
    for loc in linter.locations.get("domain_service", []):
        ops = loc["kwargs"].get("operates_on", [])
        if len(ops) < 2:
            linter.emit("WARN", "domain-service-must-cross-aggregates",
                loc["file"], loc["line"],
                f"领域服务 {loc['owner']} 的 operates_on={ops or '空'}。\n"
                f"领域服务存在的理由就是「跨聚合协调」。\n"
                f"如果只操作 1 个聚合，这个行为应该是该聚合的方法，不该独立成 service。",
                hint="要么把方法移到对应聚合，要么补齐 operates_on")


@rule("domain-service-name-not-tech")
def check_service_name_not_tech(linter: Linter):
    """Rule：领域服务名不能含技术词汇（Manager/Helper/Util 等）"""
    for loc in linter.locations.get("domain_service", []):
        name = loc["owner"]
        for tech in _TECH_NAMES:
            if name.endswith(tech) and name != f"Service":
                linter.emit("WARN", "domain-service-name-not-tech",
                    loc["file"], loc["line"],
                    f"领域服务名 {name} 含技术词汇 \"{tech}\"。\n"
                    f"领域服务必须使用业务语言命名，不能是 Manager/Helper/Util 等技术名。",
                    hint=f"用业务术语重命名，例如 PricingService、TransferService、ScoringService")
                break


@rule("domain-service-stateless")
def check_service_stateless(linter: Linter):
    """Rule：@domain_service 类应该无状态（不能有 dataclass 字段）"""
    for loc in linter.locations.get("domain_service", []):
        # 看类是否还带了 @dataclass，且有 AnnAssign 属性
        node = loc["node"]
        has_dataclass = any(decorator_call_name(d) == "dataclass" for d in node.decorator_list)
        ann_fields = [s for s in node.body if isinstance(s, ast.AnnAssign)]
        if has_dataclass and ann_fields:
            field_names = [s.target.id for s in ann_fields if isinstance(s.target, ast.Name)]
            linter.emit("ERROR", "domain-service-stateless",
                loc["file"], loc["line"],
                f"领域服务 {loc['owner']} 带 @dataclass 且声明了字段: {field_names}\n"
                f"领域服务必须无状态（纯协调器），不能持有数据。",
                hint="去掉 @dataclass 装饰器；如果真的需要状态，它应该是聚合根而不是 service")


# ============== 六边形依赖方向保护（4 条新规则）==============

# domain 层允许的 import（标准库白名单）
DOMAIN_ALLOWED_STDLIB = {
    "dataclasses", "typing", "datetime", "abc", "decimal", "uuid",
    "enum", "collections", "re", "math", "copy", "functools", "itertools",
}


def _get_layer_from_path(rel_parts: tuple) -> str | None:
    """从相对路径推断当前文件所在的层：domain / application / infrastructure / interface"""
    for part in rel_parts:
        if part in ("domain", "application", "infrastructure", "infra", "interface"):
            return "infrastructure" if part == "infra" else part
    return None


def _get_import_modules(tree: ast.AST) -> list[tuple[str, int]]:
    """提取文件中所有 import 的模块名 + 行号"""
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.append((node.module, node.lineno))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((alias.name, node.lineno))
    return imports


@rule("domain-no-third-party-import")
def check_domain_no_third_party(linter: Linter):
    """Rule：domain/ 只允许 import 标准库和本项目的 ddd 装饰器库"""
    for py_file in sorted(linter.root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = py_file.relative_to(linter.root)
        parts = rel.parts
        # 只检查 *_ctx/domain/ 下的文件
        if not parts or not parts[0].endswith("_ctx"):
            continue
        layer = _get_layer_from_path(parts)
        if layer != "domain":
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for module, line in _get_import_modules(tree):
            top = module.split(".")[0]
            # 允许：标准库白名单、ddd 装饰器库、同 ctx 内的 domain
            if top in DOMAIN_ALLOWED_STDLIB:
                continue
            if top == "ddd":
                continue
            if top == parts[0]:  # 同 ctx 内部 import
                # 检查是否 import 了 infra/interface/application
                second = module.split(".")[1] if "." in module else ""
                if second in ("infrastructure", "infra", "interface", "application"):
                    linter.emit("ERROR", "domain-no-third-party-import",
                        str(rel), line,
                        f"domain 层不允许 import 本 ctx 的 {second} 层\n"
                        f"  违规 import: {module}",
                        hint="domain 层通过接口（abc）定义依赖，不 import 具体实现")
                continue
            # 不在白名单里的顶级模块 = 第三方库或其他 ctx
            if top.endswith("_ctx"):
                continue  # cross-context-import 规则已覆盖
            # 判断是否是标准库（简单启发：尝试 import）
            # 保守策略：只拦明确不在白名单且不是项目内部的
            if top not in ("__future__",):
                linter.emit("ERROR", "domain-no-third-party-import",
                    str(rel), line,
                    f"domain 层不允许 import 第三方库或非标准模块：{module}\n"
                    f"  允许的标准库：{', '.join(sorted(DOMAIN_ALLOWED_STDLIB))}",
                    hint="如果需要外部能力，在 domain 用 abc 定义接口，在 infrastructure 实现")


@rule("domain-no-infra-import")
def check_domain_no_infra_import(linter: Linter):
    """Rule：domain/ 不能 import infrastructure/ 或 interface/"""
    for py_file in sorted(linter.root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = py_file.relative_to(linter.root)
        parts = rel.parts
        if not parts or not parts[0].endswith("_ctx"):
            continue
        layer = _get_layer_from_path(parts)
        if layer != "domain":
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for module, line in _get_import_modules(tree):
            # 检查是否 import 了任何 ctx 的 infrastructure / interface / application
            module_parts = module.split(".")
            for i, mp in enumerate(module_parts):
                if mp in ("infrastructure", "infra", "interface", "application"):
                    linter.emit("ERROR", "domain-no-infra-import",
                        str(rel), line,
                        f"domain 层不允许 import {mp} 层：{module}\n"
                        f"  依赖方向必须是 infrastructure → domain，不能反过来",
                        hint="在 domain/repository.py 定义 abc 接口，infrastructure 去实现它")
                    break


@rule("application-no-infra-concrete")
def check_application_no_infra_concrete(linter: Linter):
    """Rule：application/ 不应直接 import infrastructure 的具体类（应通过 domain 接口注入）"""
    for py_file in sorted(linter.root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = py_file.relative_to(linter.root)
        parts = rel.parts
        if not parts or not parts[0].endswith("_ctx"):
            continue
        layer = _get_layer_from_path(parts)
        if layer != "application":
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for module, line in _get_import_modules(tree):
            module_parts = module.split(".")
            for mp in module_parts:
                if mp in ("infrastructure", "infra"):
                    linter.emit("WARN", "application-no-infra-concrete",
                        str(rel), line,
                        f"application 层不应直接 import infrastructure 具体类：{module}\n"
                        f"  应通过 domain 层定义的接口（abc）注入依赖",
                        hint="在 Handler 的 __init__ 里接收接口类型参数，由组装层（main.py）注入具体实现")
                    break


@rule("agent-no-domain-import")
def check_agent_no_domain_import(linter: Linter):
    """Rule：agents/ 不能直接 import domain/application（应通过 HTTP tool 交互）"""
    agents_root = linter.root / "agents"
    if not agents_root.exists():
        return
    for py_file in sorted(agents_root.rglob("*.py")):
        if "__pycache__" in py_file.parts:
            continue
        rel = str(py_file.relative_to(linter.root))
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for module, line in _get_import_modules(tree):
            top = module.split(".")[0]
            # agents 不能 import 任何 _ctx（domain / application / infrastructure）
            if top.endswith("_ctx"):
                linter.emit("ERROR", "agent-no-domain-import",
                    rel, line,
                    f"agents/ 不允许直接 import 领域系统：{module}\n"
                    f"  Agent 是独立 Actor，应通过 HTTP API / tool schema 与领域系统交互",
                    hint="在 agents/*/tools.py 里通过 httpx 调用 /api/* 接口，不直接 import 聚合根")


# ============== CLI 入口 ==============

def main(argv: list[str]) -> int:
    if len(argv) < 1:
        print("用法: python3 scripts/codeisall_lint.py <project_dir> [--json]", file=sys.stderr)
        return 2
    project = Path(argv[0]).resolve()
    if not project.is_dir():
        print(f"错误: {project} 不是目录", file=sys.stderr)
        return 2

    json_mode = "--json" in argv

    print(f"{C('BOLD')}🔍 codeisall-lint 扫描中：{C('RESET')}{project}")
    print()

    linter = Linter(project)
    code = linter.run()

    if json_mode:
        out = {
            "project": str(project),
            "exit_code": code,
            "diagnostics": [d.to_dict() for d in linter.diagnostics],
            "summary": {
                "errors": sum(1 for d in linter.diagnostics if d.severity == "ERROR"),
                "warnings": sum(1 for d in linter.diagnostics if d.severity == "WARN"),
            },
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return code

    # 概况
    summary = (
        f"扫描统计："
        f"{len(linter.model['contexts'])} 个 Context, "
        f"{sum(1 for c in linter.model['contexts'] for a in c['aggregates'] if a.get('root'))} 个聚合根, "
        f"{len(linter.model['relations'])} 条 relations, "
        f"{len(linter.model['events'])} 个事件, "
        f"{len(linter.model['business_rules'])} 条业务规则"
    )
    print_diagnostics(linter.diagnostics, summary_extra=summary)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
