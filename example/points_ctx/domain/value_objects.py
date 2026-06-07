"""Points 值对象"""
from dataclasses import dataclass
from ddd import value_object, vo_constraint


@value_object(context="points", description="积分账户 ID 值对象")
@vo_constraint("非空")
@dataclass(frozen=True)
class PointsAccountId:
    value: str                         # ID 值
