"""Payment Context 监听 OrderPlaced 事件，创建支付单"""
from ddd import event_handler


@event_handler(
    event="OrderPlaced",
    from_context="order",
    relation_type="customer-supplier",
    integration="event",
    label="下单 → 创建支付",
    data_flow="OrderPlaced 携带 order_id, user_id, total_amount",
    failure_strategy="上游不感知（事件异步）",
)
def on_order_placed(payload, payment_repo):
    from payment_ctx.domain.payment import Payment, PaymentStatus
    from payment_ctx.domain.value_objects import PaymentId, Money
    payment = Payment(
        payment_id=PaymentId(value=f"PAY-{payload['order_id']}"),
        order_id=payload["order_id"],
        amount=Money(amount=payload["total_amount"]),
        status=PaymentStatus.PENDING,
    )
    payment_repo.save(payment)
