"""Inventory 监听 PaymentRefunded，释放库存"""
from ddd import event_handler


@event_handler(
    event="PaymentRefunded",
    from_context="payment",
    relation_type="customer-supplier",
    integration="event",
    label="退款 → 释放库存",
    data_flow="PaymentRefunded 携带 order_id, amount, reason",
    failure_strategy="上游不感知（事件异步）",
)
def on_payment_refunded(payload, stock_repo):
    pass
