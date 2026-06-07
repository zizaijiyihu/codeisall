"""Inventory 监听 OrderPlaced，预占库存"""
from ddd import event_handler


@event_handler(
    event="OrderPlaced",
    from_context="order",
    relation_type="customer-supplier",
    integration="event",
    label="下单 → 预占库存",
    data_flow="OrderPlaced 携带 order_id, lines[].product_id, lines[].quantity",
    failure_strategy="上游不感知（事件异步，库存不足时 Stock 发出 ReserveFailed）",
)
def on_order_placed(payload, stock_repo):
    # 简化示意：实际应遍历 lines 逐 SKU 预占
    pass
