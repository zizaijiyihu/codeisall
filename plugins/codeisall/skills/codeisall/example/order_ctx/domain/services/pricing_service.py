"""定价领域服务 - 跨 Order 与 Promotion 的纯计算

为什么是 Domain Service 而不是 Order 的方法？
  - 计算需要"多个 Promotion"作为输入，不属于 Order 聚合
  - 计算逻辑会随营销策略演进，不应污染 Order 聚合
  - 无状态、纯计算，是协调多聚合的典型场景
"""
from __future__ import annotations
from decimal import Decimal
from ddd import domain_service
from order_ctx.domain.order import Order
from order_ctx.domain.promotion import Promotion
from order_ctx.domain.value_objects import Money


@domain_service(
    context="order",
    description="订单定价：跨 Order 与促销规则计算最终价格",
    operates_on=["Order", "Promotion"],
)
class PricingService:
    """无状态领域服务：根据订单和促销列表，计算最终金额"""

    def calculate_final_price(
        self,
        order: Order,
        promotions: list[Promotion],
    ) -> Money:
        """计算最终价格 = 订单原价 × (1 - max applicable discount)

        precondition: order.lines 非空
        postcondition: 返回的 Money.amount >= 0
        """
        base_amount = order.total_amount.amount
        best_discount = Decimal("0")
        for promo in promotions:
            if not promo.is_active:
                continue
            if base_amount < promo.min_amount:
                continue
            if promo.discount_pct > best_discount:
                best_discount = promo.discount_pct
        final = base_amount * (Decimal("1") - best_discount)
        return Money(amount=final, currency=order.total_amount.currency)
