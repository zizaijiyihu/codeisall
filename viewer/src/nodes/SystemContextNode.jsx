import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function SystemContextNode({ data }) {
  const { ctx, onDrill, stats } = data;
  const typeLabel = { core: '核心域', supporting: '支撑域', generic: '通用域' }[ctx.type] || ctx.type;

  return (
    <div
      className={`sys-ctx-node type-${ctx.type}`}
      onDoubleClick={() => onDrill && onDrill(ctx.id)}
      title="双击进入 Context 详情"
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Left} id="left-out" />
      <Handle type="target" position={Position.Right} id="right-in" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Top} id="top" />

      <div className="sys-ctx-header">
        <span className="sys-ctx-name">{ctx.name}</span>
        <span className={`sys-ctx-badge ${ctx.type}`}>{typeLabel}</span>
      </div>
      <div className="sys-ctx-resp">{ctx.responsibility}</div>
      <div className="sys-ctx-stats">
        <span className="sys-ctx-stat">📦 {stats.aggregateName}</span>
        {stats.entityCount > 0 && <span className="sys-ctx-stat">🧱 {stats.entityCount} 实体</span>}
        {stats.voCount > 0 && <span className="sys-ctx-stat">💎 {stats.voCount} VO</span>}
      </div>
      <div className="sys-ctx-hint">双击展开 →</div>
    </div>
  );
}

export default memo(SystemContextNode);
