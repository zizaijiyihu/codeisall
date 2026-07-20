"""Order Context 订单行实体"""
from dataclasses import dataclass
from ddd import entity
from .value_objects import Money


@entity(context="order", description="订单商品明细行")
@dataclass
class OrderLine:
    line_id: str                       # 行唯一标识
    product_id: str                    # 商品 ID
    product_name: str                  # 商品名称（下单时快照）
    quantity: int                      # 购买数量
    price: Money                       # 单价（下单时快照）

    # 实体方法（不带 @command 装饰器的普通方法）
    def update_quantity(self, new_qty: int) -> None:
        """修改购买数量
        precondition: new_qty > 0
        postcondition: quantity == new_qty
        """
        if new_qty <= 0:
            raise ValueError("数量必须为正")
        self.quantity = new_qty
