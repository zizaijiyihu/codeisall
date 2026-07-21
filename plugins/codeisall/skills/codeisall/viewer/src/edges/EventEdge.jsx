import React, { useState } from 'react';
import { getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

const RELATION_LABELS = {
  'customer-supplier': 'Customer-Supplier',
  'conformist': 'Conformist',
  'anticorruption-layer': 'ACL',
  'shared-kernel': 'Shared Kernel',
  'open-host-service': 'Open Host',
  'published-language': 'Published Lang',
  'separate-ways': 'Separate Ways',
};

const INTEGRATION_LABELS = {
  'event': '异步事件',
  'api': '同步调用',
  'shared-db': '共享数据库',
};

export default function EventEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  // 多事件支持（新）：data.events 是数组，长度可能 ≥ 1
  // 兼容老的单事件格式：若无 events 数组则按 1 个事件渲染
  const events = Array.isArray(data?.events) && data.events.length
    ? data.events
    : [{
        event: data?.event,
        label: data?.label,
        relationType: data?.relationType,
        integration: data?.integration,
        dataFlow: data?.dataFlow,
        failureStrategy: data?.failureStrategy,
      }];

  const isACL = events.some(e => e.relationType === 'anticorruption-layer');
  const count = events.length;
  // 短 label：始终显示首个事件名 + 计数徽章；详情在 hover/click 时展开
  const headEvent = events[0]?.event || '?';

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: '#8c959f', strokeWidth: 1.5 }}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label-wrap nodrag nopan ${isACL ? 'acl' : ''} ${showDetail ? 'expanded' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <div
            className="edge-event-name"
            onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
            title={showDetail ? '点击折叠' : '点击展开全部事件详情'}
            style={{ cursor: 'pointer' }}
          >
            {isACL && <span className="acl-badge">ACL</span>}
            {headEvent}
            {count > 1 && <span className="edge-count-badge">+{count - 1}</span>}
            <span className="edge-toggle-hint">{showDetail ? '▾' : '▸'}</span>
          </div>
          {/* 折叠态显示首个事件的中文流程标签作为概览 */}
          {!showDetail && events[0]?.label && (
            <div className="edge-event-summary">{events[0].label}</div>
          )}
          {showDetail && (
            <div
              className="edge-detail"
              onWheel={(e) => e.stopPropagation()}       // 阻止冒泡到 React Flow，避免被解释为画布缩放
              onMouseDown={(e) => e.stopPropagation()}   // 防止被识别为 panning
            >
              {/* 多事件：列每个事件 + 方向(双向合并时区分) + 元信息（数据流 / 失败策略） */}
              {events.map((ev, idx) => (
                <div key={idx} className="edge-event-block">
                  <div className="edge-event-title">
                    <strong>{ev.event}</strong>
                    {ev.direction && events.length > 1 && (
                      <span className="edge-event-dir"> {ev.direction}</span>
                    )}
                    {ev.label ? <span className="edge-event-sublabel"> · {ev.label}</span> : null}
                  </div>
                  <div className="edge-event-meta">
                    {RELATION_LABELS[ev.relationType] || ev.relationType}
                    {ev.integration ? ` · ${INTEGRATION_LABELS[ev.integration] || ev.integration}` : ''}
                  </div>
                  {ev.dataFlow && (
                    <div className="edge-detail-row">
                      <span className="edge-detail-label">数据流</span>
                      <span className="edge-detail-val">{ev.dataFlow}</span>
                    </div>
                  )}
                  {ev.failureStrategy && (
                    <div className="edge-detail-row">
                      <span className="edge-detail-label">失败策略</span>
                      <span className="edge-detail-val">{ev.failureStrategy}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
