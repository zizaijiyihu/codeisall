"""Inventory Context 元数据"""
from ddd import bounded_context, term, routing_rule, not_responsible


@bounded_context(
    id="inventory", name="库存", type="supporting",
    responsibility="管理商品库存的预占、扣减、回补",
    type_rationale="库存是交易链路的支撑能力，保证数据正确即可，不需要复杂建模",
)
class InventoryContext: pass


@term(term="可用库存", definition="当前可以被新订单预占的库存数量",
      confusion="不是「总库存」，总库存 = 可用 + 已预占")
@term(term="预占", definition="为某个订单临时锁定的库存，尚未实际扣减",
      confusion="不是「扣减」，预占可以释放，扣减不可逆")
class InventoryTerms: pass


@routing_rule(keyword="库存查询、可用库存", belongs="inventory",
              not_belongs="不是 order（订单不管库存数量）")
@routing_rule(keyword="预占库存、锁库存", belongs="inventory",
              not_belongs="不是 order（由事件驱动，不是订单主动调）")
@routing_rule(keyword="释放库存、回补", belongs="inventory",
              not_belongs="不是 payment（退款不直接回补库存）")
class InventoryRouting: pass


@not_responsible(responsibility="订单管理")
@not_responsible(responsibility="商品信息维护")
class InventoryNotResponsible: pass
