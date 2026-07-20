import React, { memo } from 'react';

function ArchColumnHeader({ data }) {
  const { ctx } = data;
  const typeLabel = { core: '核心域', supporting: '支撑域', generic: '通用域' }[ctx.type] || ctx.type;
  return (
    <div className={`arch-col-header type-${ctx.type}`}>
      <span className="arch-col-name">{ctx.name}</span>
      <span className={`arch-col-badge ${ctx.type}`}>{typeLabel}</span>
    </div>
  );
}

export default memo(ArchColumnHeader);
