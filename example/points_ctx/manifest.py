"""Points Context 元数据"""
from ddd import bounded_context, term


@bounded_context(
    id="points", name="积分", type="supporting",
    responsibility="管理用户积分的发放、扣减、过期",
    type_rationale="积分是营销辅助能力，业务规则简单，保证正确即可",
)
class PointsContext: pass


@term(term="积分账户", definition="用户的积分余额记录，一个用户一个账户",
      confusion="不是「用户账号」，积分账户只管积分数值")
@term(term="发放", definition="增加用户积分余额",
      confusion="不等于「支付抵扣」，发放是加积分，抵扣是减积分")
class PointsTerms: pass


class PointsRouting: pass


class PointsNotResponsible: pass
