"""ddd 包入口"""
from .decorators import (
    bounded_context, term, routing_rule, not_responsible, non_consumer_of,
    aggregate_root, entity, value_object, vo_constraint, not_responsible_for, domain_service,
    invariant, command,
    event, event_handler,
    anticorruption_layer,
    business_rule,
    shared_infrastructure,
)

__all__ = [
    'bounded_context', 'term', 'routing_rule', 'not_responsible', 'non_consumer_of',
    'aggregate_root', 'entity', 'value_object', 'vo_constraint', 'not_responsible_for', 'domain_service',
    'invariant', 'command',
    'event', 'event_handler',
    'anticorruption_layer',
    'business_rule',
    'shared_infrastructure',
]
