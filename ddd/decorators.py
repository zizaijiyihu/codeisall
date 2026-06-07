"""DDD 装饰器库

设计原则：
1. 所有装饰器都是 runtime no-op，只把元数据挂到目标对象的 __ddd_meta__ 属性上
2. 装饰器参数**必须是字面量**（强约束），因为 extract.py 用 AST 静态分析提取
3. 业务代码可以正常运行，装饰器不改变行为

使用方式：装饰器集中在这里定义，业务代码 import。AST 提取器识别这些装饰器名字。
"""

# ============== 内部 helper ==============

def _attach(meta_kind):
    """生成装饰器：把字面量参数附加到目标的 __ddd_meta__ 上"""
    def decorator_factory(**kwargs):
        def decorator(target):
            if not hasattr(target, '__ddd_meta__'):
                target.__ddd_meta__ = []
            target.__ddd_meta__.append({'kind': meta_kind, **kwargs})
            return target
        return decorator
    return decorator_factory


# ============== Context 级 ==============

bounded_context = _attach('bounded_context')
term = _attach('term')
routing_rule = _attach('routing_rule')
not_responsible = _attach('not_responsible')
non_consumer_of = _attach('non_consumer_of')


# ============== 战术建模 ==============

aggregate_root = _attach('aggregate_root')
entity = _attach('entity')
value_object = _attach('value_object')
vo_constraint = _attach('vo_constraint')
not_responsible_for = _attach('not_responsible_for')
domain_service = _attach('domain_service')


# ============== 不变量 / 方法契约 ==============

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
