"""PointsAccount 聚合根"""
from __future__ import annotations
from dataclasses import dataclass
from ddd import aggregate_root, invariant, command, not_responsible_for
from .value_objects import PointsAccountId
from shared.event_bus import bus


@aggregate_root(context="points", description="积分账户聚合根")
@dataclass
class PointsAccount:
    account_id: PointsAccountId        # 积分账户唯一标识
    user_id: str                       # 所属用户
    balance: int                       # 当前积分余额

    @invariant(
        description="积分余额不能为负",
        formal="balance >= 0",
        fields=["balance"],
    )
    def _inv_balance_non_negative(self): pass

    @command(
        emits="PointsEarned",
        pre="amount > 0",
        operation="balance += amount",
        post="balance 增加 amount",
        not_do="不校验订单是否存在",
        fails="amount <= 0 → raise DomainError('发放积分必须为正数')",
    )
    def earn(self, amount: int, reason: str) -> None:
        if amount <= 0:
            raise Exception("发放积分必须为正数")
        self.balance += amount
        bus.publish("PointsEarned", {
            "user_id": self.user_id, "amount": amount, "reason": reason,
        })

    @command(
        emits="PointsDeducted",
        pre="balance >= amount, amount > 0",
        operation="balance -= amount",
        post="balance 减少 amount",
        not_do="不处理支付抵扣",
        fails="balance < amount → raise DomainError('积分余额不足')",
    )
    def deduct(self, amount: int, reason: str) -> None:
        if self.balance < amount:
            raise Exception("积分余额不足")
        self.balance -= amount
        bus.publish("PointsDeducted", {
            "user_id": self.user_id, "amount": amount, "reason": reason,
        })


@not_responsible_for(
    responsibility="订单管理",
    owner="order Context 的 Order Aggregate",
    collaboration="监听 OrderPlaced 事件来发放积分",
)
@not_responsible_for(
    responsibility="用户账号管理",
    owner="未建模（可能是 user Context）",
    collaboration="不需要协作",
)
class PointsBoundary: pass
