"""Payment Context 值对象"""
from dataclasses import dataclass
from decimal import Decimal
from ddd import value_object, vo_constraint


@value_object(context="payment", description="支付方式值对象")
@vo_constraint("channel 必须是已接入的渠道")
@dataclass(frozen=True)
class PayMethod:
    channel: str                       # 支付渠道：wechat/alipay/bank
    account: str                       # 支付账号（脱敏）


@value_object(context="payment", description="金额值对象（与 order 独立定义）")
@vo_constraint("amount >= 0")
@dataclass(frozen=True)
class Money:
    amount: Decimal                    # 金额数值
    currency: str = "CNY"              # 币种


@value_object(context="payment", description="支付单 ID 值对象")
@vo_constraint("非空")
@vo_constraint("格式为 PAY-{timestamp}-{random}")
@dataclass(frozen=True)
class PaymentId:
    value: str                         # ID 值
