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

  const isACL = data?.relationType === 'anticorruption-layer';
  const relLabel = RELATION_LABELS[data?.relationType] || data?.relationType || '';
  const intLabel = INTEGRATION_LABELS[data?.integration] || data?.integration || '';

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
          className={`edge-label-wrap ${isACL ? 'acl' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onClick={() => setShowDetail(!showDetail)}
        >
          <div className="edge-event-name">
            {isACL && <span className="acl-badge">ACL</span>}
            {data?.event}
          </div>
          <div className="edge-relation-info">
            {relLabel}{relLabel && intLabel ? ' · ' : ''}{intLabel}
          </div>
          {showDetail && (data?.dataFlow || data?.failureStrategy) && (
            <div className="edge-detail">
              {data.dataFlow && (
                <div className="edge-detail-row">
                  <span className="edge-detail-label">数据流</span>
                  <span className="edge-detail-val">{data.dataFlow}</span>
                </div>
              )}
              {data.failureStrategy && (
                <div className="edge-detail-row">
                  <span className="edge-detail-label">失败策略</span>
                  <span className="edge-detail-val">{data.failureStrategy}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
