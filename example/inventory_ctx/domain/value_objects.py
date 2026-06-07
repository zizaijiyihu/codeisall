"""Inventory 值对象"""
from dataclasses import dataclass
from ddd import value_object, vo_constraint


@value_object(context="inventory", description="商品 SKU 值对象")
@vo_constraint("非空")
@vo_constraint("全局唯一")
@dataclass(frozen=True)
class Sku:
    value: str                         # SKU 编码


@value_object(context="inventory", description="库存 ID 值对象")
@vo_constraint("非空")
@dataclass(frozen=True)
class StockId:
    value: str                         # ID 值
