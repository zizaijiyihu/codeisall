"""codeisall ddd 包入口"""
from .decorators import (
    bounded_context, term, non_consumer_of,
    aggregate_root, entity, value_object, vo_constraint, domain_service,
    invariant, command,
    event, event_handler,
    anticorruption_layer,
    business_rule,
    shared_infrastructure,
    query_handler, view_model,
    agent, agent_tool, agent_constraint, agent_skill, agent_cli,
    verifies, verifies_command, verifies_query,
)

__all__ = [
    'bounded_context', 'term', 'non_consumer_of',
    'aggregate_root', 'entity', 'value_object', 'vo_constraint', 'domain_service',
    'invariant', 'command',
    'event', 'event_handler',
    'anticorruption_layer',
    'business_rule',
    'shared_infrastructure',
    'query_handler', 'view_model',
    'agent', 'agent_tool', 'agent_constraint', 'agent_skill', 'agent_cli',
    'verifies', 'verifies_command', 'verifies_query',
]
