"""Order Context 监听 PaymentConfirmed 事件，标记订单已支付"""
from ddd import event_handler


@event_handler(
    event="PaymentConfirmed",
    from_context="payment",
    relation_type="customer-supplier",
    integration="event",
    label="支付成功 → 更新订单",
    data_flow="PaymentConfirmed 携带 payment_id, order_id, amount, paid_at",
    failure_strategy="上游不感知（事件异步）",
)
def on_payment_confirmed(payload, order_repo):
    order = order_repo.find(payload["order_id"])
    order.mark_paid()
    order_repo.save(order)
