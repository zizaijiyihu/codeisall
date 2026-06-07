import React from 'react';
import { getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

const INTEGRATION_LABELS = {
  'event': '异步事件',
  'api': '同步调用',
  'shared-db': '共享DB',
};

export default function IntegrationEdge({
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  const isACL = data?.relationType === 'anticorruption-layer';
  const intLabel = INTEGRATION_LABELS[data?.integration] || data?.integration || '';
  const strokeStyle = data?.integration === 'api'
    ? { stroke: '#0969da', strokeWidth: 2 }
    : { stroke: '#8c959f', strokeWidth: 1.5, strokeDasharray: '8 4' };

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={strokeStyle}
      />
      <EdgeLabelRenderer>
        <div
          className={`integ-edge-label ${isACL ? 'acl' : ''}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'none',
          }}
        >
          <div className="integ-event">{data?.event}</div>
          <div className="integ-type">
            {isACL && <span className="acl-badge">ACL</span>}
            {intLabel}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
