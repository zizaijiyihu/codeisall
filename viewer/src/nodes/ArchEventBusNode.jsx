import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function ArchEventBusNode({ data }) {
  const { events, width } = data;
  // events: [{ name, trigger, consumers: [{context, aggregate, method}] }]

  return (
    <div className="arch-event-bus" style={{ width }}>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Top} id="top-out" />
      <Handle type="target" position={Position.Bottom} id="bottom" />

      <div className="arch-event-bus-hdr">
        <span className="arch-event-bus-icon">📡</span>
        <span className="arch-event-bus-title">Event Bus（进程内事件总线）</span>
        <span className="arch-event-bus-sub">所有跨 Context 事件流的中央枢纽 · zero 业务语义</span>
      </div>

      <div className="arch-event-bus-body">
        {events.length === 0 && (
          <div className="arch-event-bus-empty">无事件</div>
        )}
        {events.map((ev) => (
          <div key={ev.name} className="arch-event-row">
            <div className="arch-event-name">
              <span className="arch-event-icon">🔥</span>
              <span className="arch-event-text">{ev.name}</span>
            </div>
            <div className="arch-event-trigger">
              {ev.trigger ? (<><span className="arch-event-arrow">⟵</span> {ev.trigger}</>) : null}
            </div>
            <div className="arch-event-arrow-mid">⟶</div>
            <div className="arch-event-consumers">
              {ev.consumers && ev.consumers.length > 0
                ? ev.consumers.map((c, i) => (
                  <span key={i} className="arch-event-consumer">
                    {c.context}.{c.method}
                  </span>
                ))
                : <span className="arch-event-no-consumer">⚠ 无消费者</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(ArchEventBusNode);
