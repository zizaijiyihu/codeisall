import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function ContextBgNode({ data }) {
  const { ctx, width, height, highlighted, pendingChange, onShowCtxDetail } = data;
  const typeLabel = { core: '核心域', supporting: '支撑域', generic: '通用域' }[ctx.type] || ctx.type;
  const pendingCls = pendingChange ? `pending-${pendingChange.change_type}` : '';

  return (
    <div
      className={`ctx-bg type-${ctx.type} ${highlighted ? 'knowledge-highlighted' : ''} ${pendingCls}`}
      style={{ width, height }}
    >
      {/* 跨 ctx 事件边在 ctx-bg 边界出入：8 向 handle */}
      <Handle type="target" position={Position.Top} id="top" style={{ left: '50%' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Top} id="top-out" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Left} id="left-out" style={{ top: '50%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-in" style={{ left: '50%' }} />
      <Handle type="target" position={Position.Right} id="right-in" style={{ top: '50%' }} />

      <div className="ctx-bg-header">
        <div className="ctx-bg-title">
          <span className="ctx-bg-name">{ctx.name}</span>
          <span className={`ctx-bg-badge ${ctx.type}`}>{typeLabel}</span>
          {pendingChange && (
            <span className={`pending-badge change-${pendingChange.change_type}`} title={pendingChange.reason}>
              {pendingChange.change_type === 'add' && '＋ 待新增'}
              {pendingChange.change_type === 'modify' && '✎ 待修改'}
              {pendingChange.change_type === 'remove' && '✕ 待删除'}
              {pendingChange.change_type === 'conflict' && '⚠ 冲突'}
            </span>
          )}
        </div>
        <button
          className="ctx-bg-info-btn"
          onClick={() => onShowCtxDetail && onShowCtxDetail(ctx)}
        >
          详情
        </button>
      </div>
    </div>
  );
}

export default memo(ContextBgNode);
