"""codeisall 装饰器库

设计原则：
1. 所有装饰器都是 runtime no-op，只把元数据挂到目标对象的 __codeisall_meta__ 属性上
2. 装饰器参数**必须是字面量**（强约束），因为 extract.py 用 AST 静态分析提取
3. 业务代码可以正常运行，装饰器不改变行为

使用方式：装饰器集中在这里定义，业务代码 import。AST 提取器识别这些装饰器名字。
"""

# ============== 内部 helper ==============

def _attach(meta_kind):
    """生成装饰器：把字面量参数附加到目标的 __codeisall_meta__ 上"""
    def decorator_factory(**kwargs):
        def decorator(target):
            if not hasattr(target, '__codeisall_meta__'):
                target.__codeisall_meta__ = []
            target.__codeisall_meta__.append({'kind': meta_kind, **kwargs})
            # 兼容旧名字
            target.__ddd_meta__ = target.__codeisall_meta__
            return target
        return decorator
    return decorator_factory


# ============== Context 级 ==============

bounded_context = _attach('bounded_context')
term = _attach('term')
non_consumer_of = _attach('non_consumer_of')


# ============== 战术建模（domain 层） ==============

aggregate_root = _attach('aggregate_root')
entity = _attach('entity')
value_object = _attach('value_object')
vo_constraint = _attach('vo_constraint')
domain_service = _attach('domain_service')


# ============== 不变量 / 方法契约（domain 层） ==============

invariant = _attach('invariant')
command = _attach('command')


# ============== 事件 ==============

event = _attach('event')
event_handler = _attach('event_handler')


# ============== 防腐层 ==============

anticorruption_layer = _attach('anticorruption_layer')


# ============== 业务规则 ==============

business_rule = _attach('business_rule')


# ============== 共享基础设施 ==============

shared_infrastructure = _attach('shared_infrastructure')


# ============== CQRS 查询侧（application 层） ==============

# query_handler：声明一个查询用例。装饰在 application/queries/ 下的函数上。
# 字段：
#   name        查询名（唯一标识，全 ctx 内唯一）
#   returns     返回的视图模型类名（必须对应一个 @view_model）
#   visibility  业务可见性规则（自然语言，可选；如"只能看本团队的周报"）
#   reads_from  读哪些 ctx（list[str]，多个表示跨 ctx 查询）
#   backed_by   "read_model" | "aggregate_repo"（数据源类型）
#   description 可选描述
query_handler = _attach('query_handler')

# view_model：声明一个读模型/视图。装饰在 application/views/ 下的类上。
# 字段：
#   name    视图模型名（被 query_handler.returns 引用）
#   fields  字段定义 list[{name, type, description?}]
#   source  数据来源描述（如 "read_model.reports_by_team" 或 "Report 聚合投影"）
view_model = _attach('view_model')


# ============== Agent 装饰器（agents/ 目录） ==============

agent = _attach('agent')
agent_tool = _attach('agent_tool')
agent_constraint = _attach('agent_constraint')
agent_skill = _attach('agent_skill')
agent_cli = _attach('agent_cli')


# ============== 知识驱动测试 ==============

# verifies：测试函数验证哪条 @invariant
verifies = _attach('verifies')

# verifies_command：测试函数验证哪个 @command 的哪个方面（pre/post/emits/fails）
verifies_command = _attach('verifies_command')

# verifies_query：测试函数验证哪个 @query_handler 的哪个方面
#   aspect="visibility" 验证可见性过滤规则
#   aspect="filter"     验证查询过滤逻辑
#   aspect="shape"      验证返回视图模型的形状
verifies_query = _attach('verifies_query')
