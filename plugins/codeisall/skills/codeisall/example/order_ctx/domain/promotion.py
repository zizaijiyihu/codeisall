"""Promotion 聚合根 - 促销规则

简化模型：一条促销 = 折扣百分比 + 满减门槛 + 启用状态
"""
from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal
from ddd import aggregate_root, invariant, command


@aggregate_root(context="order", description="促销规则聚合根")
@dataclass
class Promotion:
    promo_id: str                          # 促销唯一标识
    name: str                              # 促销名称
    discount_pct: Decimal                  # 折扣百分比（0.10 表示 9 折）
    min_amount: Decimal                    # 满减门槛
    is_active: bool                        # 是否启用

    @invariant(
        description="折扣百分比必须在 0~1 之间",
        formal="0 <= discount_pct <= 1",
        fields=["discount_pct"],
    )
    def _inv_discount_range(self): pass

    @invariant(
        description="满减门槛不能为负",
        formal="min_amount >= 0",
        fields=["min_amount"],
    )
    def _inv_min_amount_non_negative(self): pass

    @command(
        pre="is_active == True",
        operation="is_active → False",
        post="is_active == False",
        not_do="不删除促销记录（保留审计）",
        fails="is_active == False → 已经停用",
    )
    def deactivate(self) -> None:
        if not self.is_active:
            raise Exception("促销已停用")
        self.is_active = False
