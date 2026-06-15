"""Points 监听 OrderPlaced，发放积分

这个 handler 同时守护一条跨 ctx 业务规则："下单成功送积分"。
装饰器位置 = 守护代码位置 —— 不可分离。
"""
from ddd import event_handler, business_rule


@business_rule(
    rule="下单成功送积分",
    source="营销规则",
    involves=["Order", "PointsAccount"],
    timing="消费 OrderPlaced 事件时，按订单金额折算积分",
)
@event_handler(
    event="OrderPlaced",
    from_context="order",
    relation_type="customer-supplier",
    integration="event",
    label="下单 → 送积分",
    data_flow="OrderPlaced 携带 user_id, total_amount",
    failure_strategy="上游不感知（事件异步，积分失败不影响订单）",
)
def on_order_placed(payload, points_repo):
    """守护"下单送积分"业务规则。"""
    # 简化示意：实际实现读 OrderPlaced.total_amount → 计算积分 → 调 PointsAccount.earn()
    pass
