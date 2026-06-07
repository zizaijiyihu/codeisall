import React, { memo } from 'react';

const LAYER_LABELS = {
  blue:   { icon: '📡', name: 'Interface',      desc: '对外暴露的入口（HTTP / 事件发布）' },
  green:  { icon: '⚙',  name: 'Application',    desc: '用例编排（Command / Event Handler）' },
  purple: { icon: '💎', name: 'Domain',         desc: '纯业务逻辑（Aggregate / Entity / VO / 不变量）' },
  gray:   { icon: '🔧', name: 'Infrastructure', desc: '技术实现（Repository / Publisher / 网关 / ACL）' },
};

function ArchLayerBand({ data }) {
  const { color, width, height } = data;
  const meta = LAYER_LABELS[color] || { icon: '', name: '', desc: '' };
  return (
    <div className={`arch-layer-band layer-${color}`} style={{ width, height }}>
      <div className="arch-layer-band-label">
        <span className="arch-layer-band-icon">{meta.icon}</span>
        <span className="arch-layer-band-name">{meta.name}</span>
        <span className="arch-layer-band-desc">{meta.desc}</span>
      </div>
    </div>
  );
}

export default memo(ArchLayerBand);
