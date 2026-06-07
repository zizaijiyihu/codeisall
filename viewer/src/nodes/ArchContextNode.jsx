import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function LayerSection({ icon, title, color, children }) {
  return (
    <div className={`arch-layer arch-layer-${color}`}>
      <div className="arch-layer-hdr">
        <span className="arch-layer-icon">{icon}</span>
        <span className="arch-layer-title">{title}</span>
      </div>
      <div className="arch-layer-body">{children}</div>
    </div>
  );
}

function TagList({ items, className }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="arch-tags">
      {items.map((item, i) => (
        <span key={i} className={`arch-tag ${className || ''}`}>{item}</span>
      ))}
    </div>
  );
}

function ArchContextNode({ data }) {
  const { ctx, layers } = data;
  const typeLabel = { core: '核心域', supporting: '支撑域', generic: '通用域' }[ctx.type] || ctx.type;

  return (
    <div className={`arch-node type-${ctx.type}`}>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />

      <div className="arch-node-header">
        <span className="arch-node-name">{ctx.name}</span>
        <span className={`arch-node-badge ${ctx.type}`}>{typeLabel}</span>
      </div>

      <LayerSection icon="📡" title="Interface" color="blue">
        {layers.eventsOut.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">Open Host Events</span>
            <TagList items={layers.eventsOut} className="event" />
          </div>
        )}
        {layers.eventsOut.length === 0 && (
          <div className="arch-empty">无对外事件</div>
        )}
      </LayerSection>

      <LayerSection icon="⚙" title="Application" color="green">
        {layers.commands.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">Commands</span>
            <TagList items={layers.commands} className="command" />
          </div>
        )}
        {layers.eventHandlers.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">Event Handlers</span>
            <TagList items={layers.eventHandlers} className="handler" />
          </div>
        )}
      </LayerSection>

      <LayerSection icon="💎" title="Domain" color="purple">
        <div className="arch-row">
          <span className="arch-row-label">Aggregate</span>
          <span className="arch-tag root">{layers.root}</span>
        </div>
        {layers.entities.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">Entities</span>
            <TagList items={layers.entities} className="entity" />
          </div>
        )}
        {layers.valueObjects.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">Value Objects</span>
            <TagList items={layers.valueObjects} className="vo" />
          </div>
        )}
      </LayerSection>

      <LayerSection icon="🔧" title="Infrastructure" color="gray">
        <div className="arch-row">
          <TagList items={['Persistence', 'Messaging/Outbox']} className="infra" />
        </div>
        {layers.acl.length > 0 && (
          <div className="arch-row">
            <span className="arch-row-label">ACL</span>
            <TagList items={layers.acl.map(a => `${a}_acl`)} className="acl" />
          </div>
        )}
      </LayerSection>
    </div>
  );
}

export default memo(ArchContextNode);
