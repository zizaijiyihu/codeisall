"""Order 聚合根

聚合的核心业务知识都在这里：
- @aggregate_root 标注聚合根
- @invariant 标注不变量（业务约束）
- @command 标注业务方法及其契约
- @not_responsible_for 标注本聚合不做什么
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from ddd import (
    aggregate_root, invariant, command, not_responsible_for,
)
from .value_objects import Money, Address, OrderId
from .order_line import OrderLine
from shared.event_bus import bus


class OrderStatus(str, Enum):
    DRAFT = "DRAFT"
    PLACED = "PLACED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


@aggregate_root(context="order", description="订单聚合根")
@dataclass
class Order:
    order_id: OrderId                              # 订单唯一标识
    user_id: str                                   # 下单用户
    status: OrderStatus                            # 订单状态：DRAFT/PLACED/PAID/CANCELLED
    total_amount: Money                            # 订单总金额
    lines: list[OrderLine]                         # 订单商品明细
    shipping_address: Address                      # 收货地址
    placed_at: Optional[datetime] = None           # 下单时间
    cancelled_at: Optional[datetime] = None        # 取消时间

    # ====== 不变量 ======
    @invariant(
        description="订单总金额等于所有商品行金额之和",
        formal="len(lines) > 0 → total_amount == sum(line.price.amount × line.quantity for line in lines)",
        fields=["total_amount", "lines[].price", "lines[].quantity"],
    )
    def _inv_total_matches_lines(self): pass

    @invariant(
        description="已取消的订单不能变更为其他状态",
        formal="old.status == CANCELLED → new.status == CANCELLED",
        fields=["status"],
    )
    def _inv_cancelled_terminal(self): pass

    # ====== 命令（业务方法）======
    @command(
        emits="OrderPlaced",
        pre="status == DRAFT, lines 非空",
        operation="status → PLACED, 记录 placed_at = now()",
        post="status == PLACED, placed_at 非空",
        not_do="不扣库存、不创建支付单、不发通知",
        fails="status != DRAFT → raise DomainError('只有草稿可下单'); lines 为空 → raise DomainError('订单必须包含商品')",
    )
    def place(self) -> None:
        if self.status != OrderStatus.DRAFT:
            raise Exception("只有草稿可下单")
        if not self.lines:
            raise Exception("订单必须包含商品")
        self.status = OrderStatus.PLACED
        self.placed_at = datetime.now()
        bus.publish("OrderPlaced", {
            "order_id": self.order_id.value,
            "user_id": self.user_id,
            "total_amount": self.total_amount.amount,
            "placed_at": self.placed_at,
        })

    @command(
        emits="OrderCancelled",
        pre="status in (DRAFT, PLACED)",
        operation="status → CANCELLED, 记录 cancelled_at = now()",
        post="status == CANCELLED",
        not_do="不退款、不回补库存",
        fails="status not in (DRAFT, PLACED) → raise DomainError('当前状态不可取消')",
    )
    def cancel(self, reason: str) -> None:
        if self.status not in (OrderStatus.DRAFT, OrderStatus.PLACED):
            raise Exception("当前状态不可取消")
        self.status = OrderStatus.CANCELLED
        self.cancelled_at = datetime.now()
        bus.publish("OrderCancelled", {
            "order_id": self.order_id.value,
            "reason": reason,
            "cancelled_at": self.cancelled_at,
        })

    @command(
        pre="status == DRAFT, qty > 0, price > 0",
        operation="创建 OrderLine 并加入 lines，重算 total_amount",
        post="lines 增加一条, total_amount 已更新",
        not_do="不校验库存是否充足",
        fails="status != DRAFT → raise DomainError('只有草稿可添加商品')",
    )
    def add_line(self, product_id: str, product_name: str, qty: int, price: Money) -> None:
        if self.status != OrderStatus.DRAFT:
            raise Exception("只有草稿可添加商品")
        self.lines.append(OrderLine(
            line_id=f"L{len(self.lines)+1}",
            product_id=product_id, product_name=product_name,
            quantity=qty, price=price,
        ))

    @command(
        pre="status == PLACED",
        operation="status → PAID",
        post="status == PAID",
        not_do="不处理支付逻辑本身",
        fails="status != PLACED → raise DomainError('只有已下单的订单可标记为已支付')",
    )
    def mark_paid(self) -> None:
        if self.status != OrderStatus.PLACED:
            raise Exception("只有已下单的订单可标记为已支付")
        self.status = OrderStatus.PAID


# ====== 边界声明（聚合不负责清单）======
@not_responsible_for(
    responsibility="支付收款",
    owner="payment Context 的 Payment Aggregate",
    collaboration="本 Aggregate 发出 OrderPlaced 事件，Payment 监听后创建支付单",
)
@not_responsible_for(
    responsibility="库存扣减",
    owner="inventory Context 的 Stock Aggregate",
    collaboration="本 Aggregate 发出 OrderPlaced 事件，Stock 监听后预占库存",
)
@not_responsible_for(
    responsibility="积分发放",
    owner="points Context 的 PointsAccount Aggregate",
    collaboration="本 Aggregate 发出 OrderPlaced 事件，PointsAccount 监听后发放积分",
)
class OrderBoundary: pass
