"""Points 监听 OrderPlaced，发放积分"""
from ddd import event_handler


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
    # 简化示意
    pass
