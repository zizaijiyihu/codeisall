"""Payment 聚合根"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

from ddd import aggregate_root, invariant, command, not_responsible_for
from .value_objects import Money, PayMethod, PaymentId
from shared.event_bus import bus


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


@aggregate_root(context="payment", description="支付聚合根")
@dataclass
class Payment:
    payment_id: PaymentId              # 支付单唯一标识
    order_id: str                      # 关联订单 ID
    amount: Money                      # 支付金额
    status: PaymentStatus              # PENDING/PAID/REFUNDED
    method: Optional[PayMethod] = None # 支付方式
    paid_at: Optional[datetime] = None # 支付时间

    @invariant(
        description="支付金额必须为正",
        formal="amount.amount > 0",
        fields=["amount"],
    )
    def _inv_amount_positive(self): pass

    @invariant(
        description="已完成的支付不可再次支付",
        formal="status == PAID → pay() 不可调用",
        fields=["status"],
    )
    def _inv_paid_terminal(self): pass

    @command(
        emits="PaymentConfirmed",
        pre="status == PENDING",
        operation="status → PAID, method = method, paid_at = now()",
        post="status == PAID",
        not_do="不修改订单状态",
        fails="status != PENDING → raise DomainError('只有待支付状态可以支付')",
    )
    def pay(self, method: PayMethod) -> None:
        if self.status != PaymentStatus.PENDING:
            raise Exception("只有待支付状态可以支付")
        self.status = PaymentStatus.PAID
        self.method = method
        self.paid_at = datetime.now()
        bus.publish("PaymentConfirmed", {
            "payment_id": self.payment_id.value,
            "order_id": self.order_id,
            "amount": self.amount.amount,
            "paid_at": self.paid_at,
        })

    @command(
        emits="PaymentRefunded",
        pre="status == PAID",
        operation="status → REFUNDED",
        post="status == REFUNDED",
        not_do="不取消订单",
        fails="status != PAID → raise DomainError('只有已支付的订单可以退款')",
    )
    def refund(self, reason: str) -> None:
        if self.status != PaymentStatus.PAID:
            raise Exception("只有已支付的订单可以退款")
        self.status = PaymentStatus.REFUNDED
        bus.publish("PaymentRefunded", {
            "payment_id": self.payment_id.value,
            "order_id": self.order_id,
            "amount": self.amount.amount,
            "reason": reason,
        })


@not_responsible_for(
    responsibility="订单状态管理",
    owner="order Context 的 Order Aggregate",
    collaboration="本 Aggregate 发出 PaymentConfirmed 事件，Order 监听后标记为已支付",
)
@not_responsible_for(
    responsibility="物流追踪",
    owner="未建模（可能是 logistics Context）",
    collaboration="不需要协作",
)
class PaymentBoundary: pass
