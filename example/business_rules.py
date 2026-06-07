"""跨 Context 业务规则集中声明

业务规则不属于任何一个聚合，但承接者必须指向具体聚合/方法
"""
from ddd import business_rule


@business_rule(
    rule="订单金额不能为负",
    source="业务基本约束",
    aggregate="Order",
    method="add_line()",
    timing="每次添加商品行时校验 total 非负",
)
class OrderAmountNonNegative: pass


@business_rule(
    rule="已取消订单不可再操作",
    source="业务基本约束",
    aggregate="Order",
    method="所有状态变更方法",
    timing="任何状态变更前校验",
)
class CancelledOrderImmutable: pass


@business_rule(
    rule="支付金额必须与订单金额一致",
    source="财务合规",
    aggregate="Payment",
    method="pay()",
    timing="支付前校验（由应用层传入订单金额比对）",
)
class PaymentAmountMatchOrder: pass


@business_rule(
    rule="库存预占不能超过可用库存",
    source="业务基本约束",
    aggregate="Stock",
    method="reserve()",
    timing="预占时校验",
)
class ReserveWithinAvailable: pass


@business_rule(
    rule="积分余额不能为负",
    source="业务基本约束",
    aggregate="PointsAccount",
    method="deduct()",
    timing="扣减时校验",
)
class PointsNonNegative: pass


@business_rule(
    rule="下单成功送积分",
    source="营销规则",
    aggregate="PointsAccount",
    method="earn()",
    timing="消费 OrderPlaced 事件时，由应用层计算积分数",
)
class GrantPointsOnPlaced: pass
