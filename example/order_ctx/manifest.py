"""Order Context 元数据声明

战略层知识：Context 定位、统一语言、路由规则、边界声明
"""
from ddd import bounded_context, term


@bounded_context(
    id="order", name="订单", type="core",
    responsibility="管理订单从创建到完成的生命周期",
    type_rationale="订单是平台核心交易能力，直接决定营收，需要最精细的战术设计",
)
class OrderContext: pass


# === 统一语言 ===
@term(
    term="订单",
    definition="买家的一次购买行为，包含商品明细和收货信息",
    confusion="payment Context 中的「交易」不是订单，是资金流转记录",
)
@term(
    term="订单行",
    definition="订单中一条商品明细，记录商品、数量、单价",
    confusion="inventory Context 中的「SKU」是库存维度，不是订单行",
)
@term(
    term="下单",
    definition="将草稿订单确认提交，触发后续支付和库存流程",
    confusion="不等于「支付」，下单后订单处于待支付状态",
)
class OrderTerms: pass


# === 路由规则 ===
class OrderRouting: pass


# === 不负责清单（Context 级声明）===
class OrderNotResponsible: pass
