"""订单列表视图（CQRS 读模型）

声明用户视角能看到的订单列表形态。**不在 domain 层** —— 这是 application 层的数据投影。
"""
from dataclasses import dataclass
from ddd import view_model


@view_model(
    name="OrderListView",
    fields=[
        {"name": "order_id", "type": "str", "description": "订单号"},
        {"name": "customer_id", "type": "str", "description": "下单客户"},
        {"name": "total_amount", "type": "Decimal", "description": "订单总额"},
        {"name": "status", "type": "str", "description": "订单状态"},
        {"name": "placed_at", "type": "datetime", "description": "下单时间"},
    ],
    source="read_model.orders_view",
    description="客户订单列表视图，按下单时间倒序",
)
@dataclass(frozen=True)
class OrderListView:
    order_id: str
    customer_id: str
    total_amount: object  # Decimal
    status: str
    placed_at: object     # datetime
