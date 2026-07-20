import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function SharedInfraNode({ data }) {
  const { items, width } = data;

  return (
    <div className="shared-infra" style={{ width }}>
      <Handle type="target" position={Position.Top} id="top" />
      <div className="shared-infra-title">🔧 Shared Infrastructure（所有 Context 共用）</div>
      <div className="shared-infra-grid">
        {items.map((it) => (
          <div key={it.id} className={`shared-infra-item kind-${it.kind}`} title={it.path}>
            <div className="sii-icon">{it.icon}</div>
            <div className="sii-name">{it.name}</div>
            <div className="sii-desc">{it.description}</div>
            <div className="sii-path">{it.path}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(SharedInfraNode);
