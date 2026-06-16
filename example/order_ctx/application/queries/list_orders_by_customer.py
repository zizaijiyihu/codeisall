"""按客户查询订单列表（CQRS 查询用例）

可见性规则：客户只能看自己的订单（requester.customer_id == query.customer_id）。
"""
from ddd import query_handler
from ..views.order_list_view import OrderListView


@query_handler(
    name="list_orders_by_customer",
    returns="OrderListView",
    visibility="只能查询 requester.customer_id == query.customer_id 的订单（客户只能看自己）",
    reads_from=["order_ctx"],
    backed_by="read_model",
    description="按客户 ID 列出其所有订单，按下单时间倒序",
)
def handle(query, requester) -> list[OrderListView]:
    """实现阶段填充。

    pseudocode:
        if requester.customer_id != query.customer_id and not requester.is_admin:
            raise PermissionDenied
        rows = read_rders_view.where(customer_id=query.customer_id)
        return [OrderListView(**r) for r in rows]
    """
    pass
