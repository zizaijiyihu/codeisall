"""Stock 聚合根"""
from __future__ import annotations
from dataclasses import dataclass
from ddd import aggregate_root, invariant, command, not_responsible_for
from .value_objects import Sku, StockId
from shared.event_bus import bus


@aggregate_root(context="inventory", description="库存聚合根")
@dataclass
class Stock:
    stock_id: StockId                  # 库存记录唯一标识
    sku: Sku                           # 商品 SKU
    available_quantity: int            # 可用库存
    reserved_quantity: int             # 已预占库存

    @invariant(
        description="可用库存不能为负",
        formal="available_quantity >= 0",
        fields=["available_quantity"],
    )
    def _inv_available_non_negative(self): pass

    @invariant(
        description="已预占库存不能为负",
        formal="reserved_quantity >= 0",
        fields=["reserved_quantity"],
    )
    def _inv_reserved_non_negative(self): pass

    @command(
        emits="StockReserved",
        pre="available_quantity >= qty, qty > 0",
        operation="available_quantity -= qty, reserved_quantity += qty",
        post="available_quantity 减少 qty, reserved_quantity 增加 qty",
        not_do="不创建订单",
        fails="available_quantity < qty → raise DomainError('库存不足')",
    )
    def reserve(self, qty: int) -> None:
        if self.available_quantity < qty:
            raise Exception("库存不足")
        self.available_quantity -= qty
        self.reserved_quantity += qty
        bus.publish("StockReserved", {
            "stock_id": self.stock_id.value,
            "sku": self.sku.value, "qty": qty,
        })

    @command(
        emits="StockReleased",
        pre="reserved_quantity >= qty, qty > 0",
        operation="available_quantity += qty, reserved_quantity -= qty",
        post="available_quantity 增加 qty, reserved_quantity 减少 qty",
        not_do="不处理退款",
        fails="reserved_quantity < qty → raise DomainError('预占不足无法释放')",
    )
    def release(self, qty: int) -> None:
        if self.reserved_quantity < qty:
            raise Exception("预占不足无法释放")
        self.available_quantity += qty
        self.reserved_quantity -= qty
        bus.publish("StockReleased", {
            "stock_id": self.stock_id.value,
            "sku": self.sku.value, "qty": qty,
        })


@not_responsible_for(
    responsibility="订单管理",
    owner="order Context 的 Order Aggregate",
    collaboration="监听 OrderPlaced/OrderCancelled 事件来预占/释放库存",
)
@not_responsible_for(
    responsibility="商品信息维护",
    owner="未建模（可能是 product Context）",
    collaboration="不需要协作",
)
class StockBoundary: pass
