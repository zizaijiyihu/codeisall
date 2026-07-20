"""Inventory Context 元数据"""
from ddd import bounded_context, term


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


class InventoryRouting: pass


class InventoryNotResponsible: pass
