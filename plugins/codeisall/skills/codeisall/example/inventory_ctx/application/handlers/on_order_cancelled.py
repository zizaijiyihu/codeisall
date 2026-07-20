"""Inventory 监听 OrderCancelled，释放库存"""
from ddd import event_handler


@event_handler(
    event="OrderCancelled",
    from_context="order",
    relation_type="customer-supplier",
    integration="event",
    label="取消 → 释放库存",
    data_flow="OrderCancelled 携带 order_id",
    failure_strategy="上游不感知（事件异步）",
)
def on_order_cancelled(payload, stock_repo):
    pass
