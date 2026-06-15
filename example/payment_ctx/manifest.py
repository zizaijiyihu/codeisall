"""Payment Context 元数据"""
from ddd import bounded_context, term


@bounded_context(
    id="payment", name="支付", type="core",
    responsibility="处理付款、退款、对账",
    type_rationale="支付直接涉及资金流转，是交易链路核心能力，错误容忍度极低",
)
class PaymentContext: pass


@term(term="支付单", definition="一次资金收取操作的记录，关联某个订单",
      confusion="不是「订单」，支付单只管钱的流转")
@term(term="退款", definition="将已收取的款项原路返回给用户",
      confusion="不等于「取消订单」，退款是资金操作，取消是订单状态变更")
class PaymentTerms: pass


class PaymentRouting: pass


class PaymentNotResponsible: pass
