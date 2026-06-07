"""Order Context 值对象

每个 VO 一个文件，frozen 且带约束
"""
from dataclasses import dataclass
from decimal import Decimal
from ddd import value_object, vo_constraint


@value_object(context="order", description="金额值对象，不可变")
@vo_constraint("amount >= 0")
@vo_constraint("currency 为 ISO 4217 标准代码")
@dataclass(frozen=True)
class Money:
    amount: Decimal                    # 金额数值
    currency: str = "CNY"              # 币种，默认 CNY


@value_object(context="order", description="收货地址值对象")
@vo_constraint("所有字段非空")
@dataclass(frozen=True)
class Address:
    province: str                      # 省
    city: str                          # 市
    district: str                      # 区
    street: str                        # 详细地址
    receiver: str                      # 收件人
    phone: str                         # 联系电话


@value_object(context="order", description="订单 ID 值对象")
@vo_constraint("非空")
@vo_constraint("格式为 ORD-{timestamp}-{random}")
@dataclass(frozen=True)
class OrderId:
    value: str                         # ID 值
