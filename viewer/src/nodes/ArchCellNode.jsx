import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function ArchCellNode({ data }) {
  const { layer, chips, focusChip, onClickChip } = data;
  return (
    <div className={`arch-cell layer-${layer.color}`}>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Top} id="top-out" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Bottom} id="bottom-out" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Left} id="left-out" />
      <Handle type="target" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Right} id="right-out" />

      <div className="arch-cell-hdr">
        <span className="arch-cell-icon">{layer.icon}</span>
        <span className="arch-cell-title">{layer.title}</span>
      </div>
      <div className="arch-cell-body">
        {chips.length === 0 && <div className="arch-cell-empty">—</div>}
        {chips.map((c, i) => (
          <div
            key={i}
            className={`arch-chip type-${c.type || 'default'} ${focusChip === c.name ? 'focused' : ''} ${c.file ? 'clickable' : ''}`}
            title={c.desc || c.name}
            onClick={() => c.file && onClickChip && onClickChip(c)}
          >
            <span className="arch-chip-name">{c.name}</span>
            {c.tag && <span className={`arch-chip-tag tag-${c.tag}`}>{c.tag}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(ArchCellNode);
