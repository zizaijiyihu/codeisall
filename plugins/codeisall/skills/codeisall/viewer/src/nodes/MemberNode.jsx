import React, { useState, memo } from 'react';
import { Handle, Position } from '@xyflow/react';

function Section({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="member-section">
      <div className="sub-label clickable" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {title}
        {count > 0 && <span className="sub-count">{count}</span>}
      </div>
      {open && children}
    </div>
  );
}

function MethodItem({ method }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="meth">
      <div className="meth-hdr" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {method.name}
      </div>
      {open && (
        <div className="meth-detail">
          <div className="md-row"><span className="md-label">前置</span><span className="md-val">{method.precondition}</span></div>
          {method.operation && <div className="md-row"><span className="md-label">操作</span><span className="md-val">{method.operation}</span></div>}
          <div className="md-row"><span className="md-label">后置</span><span className="md-val">{method.postcondition}</span></div>
          <div className="md-row"><span className="md-label">事件</span><span className="md-val ev">{method.event}</span></div>
          <div className="md-row"><span className="md-label">不做</span><span className="md-val nd">{method.not_do}</span></div>
          {method.failure && <div className="md-row"><span className="md-label">失败</span><span className="md-val fail">{method.failure}</span></div>}
        </div>
      )}
    </div>
  );
}

function InvariantItem({ inv }) {
  const [open, setOpen] = useState(false);
  if (typeof inv === 'string') return <div className="inv-row">{inv}</div>;
  return (
    <div className="inv-item">
      <div className="inv-row clickable" onClick={() => setOpen(!open)}>
        {inv.description} {open ? '▾' : '▸'}
      </div>
      {open && (
        <div className="inv-detail">
          <div className="inv-formal">{inv.formal}</div>
          <div className="inv-fields">涉及: {inv.fields.join(', ')}</div>
        </div>
      )}
    </div>
  );
}

function MemberNode({ data }) {
  const { member, memberType, invariants, methods, onShowDetail, onJumpToArch, contextId, highlighted, operatesOn, pendingChange } = data;
  const [expanded, setExpanded] = useState(false);

  const typeLabels = { root: 'Aggregate Root', entity: 'Entity', vo: 'Value Object', service: 'Domain Service', empty: '等待战术设计' };
  const isRoot = memberType === 'root';
  const isService = memberType === 'service';
  const isEmpty = memberType === 'empty';

  const attrCount = member.attributes?.length || 0;
  const constraintCount = member.constraints?.length || 0;
  const methodCount = member.methods?.length || 0;
  const invCount = invariants?.length || 0;
  const rootMethodCount = methods?.length || 0;

  const pendingCls = pendingChange ? `pending-${pendingChange.change_type}` : '';

  return (
    <div className={`member-node type-${memberType} ${highlighted ? 'knowledge-highlighted' : ''} ${pendingCls}`}>
      {pendingChange && (
        <div className={`pending-badge change-${pendingChange.change_type}`} title={pendingChange.reason}>
          {pendingChange.change_type === 'add' && '＋ 待新增'}
          {pendingChange.change_type === 'modify' && '✎ 待修改'}
          {pendingChange.change_type === 'remove' && '✕ 待删除'}
          {pendingChange.change_type === 'conflict' && '⚠ 冲突'}
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
      {/* 反向 handle：让边能从任意方向连接 */}
      <Handle type="source" position={Position.Top} id="top-out" />
      <Handle type="source" position={Position.Left} id="left-out" />
      <Handle type="target" position={Position.Bottom} id="bottom-in" />
      <Handle type="target" position={Position.Right} id="right-in" />

      <div className="member-node-ctx">
        <span className={`ctx-label ${data.contextType}`}>{data.contextName}</span>
      </div>
      <div className="member-node-hdr" onClick={() => !isEmpty && setExpanded(!expanded)}>
        <div className="member-node-title">
          <span className={`member-type-badge ${memberType}`}>{typeLabels[memberType]}</span>
          <span className="member-node-name">{isEmpty ? '⏳' : member.name}</span>
        </div>
        {!isEmpty && (
          <div className="member-node-actions">
            <button
              className="member-action-btn"
              title="查看详情"
              onClick={(e) => { e.stopPropagation(); onShowDetail && onShowDetail(contextId, member.name); }}
            >👁</button>
            <button
              className="member-action-btn"
              title="在架构图中定位"
              onClick={(e) => { e.stopPropagation(); onJumpToArch && onJumpToArch(contextId, member.name); }}
            >🏗</button>
            <span className="member-arrow">{expanded ? '▼' : '▶'}</span>
          </div>
        )}
      </div>

      {member.description && <div className="member-node-desc">{member.description}</div>}

      {!expanded && !isEmpty && (
        <div className="member-node-summary">
          {isService && operatesOn && operatesOn.length > 0 && (
            <div className="service-ops-inline">
              <span className="service-ops-label">协作聚合：</span>
              {operatesOn.map((n) => (
                <span key={n} className="service-op-tag">{n}</span>
              ))}
            </div>
          )}
          {isService && (member.methods?.length || 0) > 0 && (
            <span className="summary-tag meth">{member.methods.length} 操作</span>
          )}
          {!isService && attrCount > 0 && <span className="summary-tag">{attrCount} 属性</span>}
          {isRoot && invCount > 0 && <span className="summary-tag inv">{invCount} 不变量</span>}
          {isRoot && rootMethodCount > 0 && <span className="summary-tag meth">{rootMethodCount} 方法</span>}
          {!isRoot && !isService && methodCount > 0 && <span className="summary-tag meth">{methodCount} 方法</span>}
          {constraintCount > 0 && <span className="summary-tag constraint">{constraintCount} 约束</span>}
          {member.frozen && <span className="summary-tag frozen">frozen</span>}
        </div>
      )}

      {expanded && (
        <div className="member-node-body">
          {pendingChange && (
            <div className={`pending-detail change-${pendingChange.change_type}`}>
              <div className="pending-detail-row">
                <span className="pending-detail-label">原因</span>
                <span className="pending-detail-val">{pendingChange.reason}</span>
              </div>
              {pendingChange.prompt_hint && (
                <div className="pending-detail-row">
                  <span className="pending-detail-label">提示</span>
                  <span className="pending-detail-val mono">{pendingChange.prompt_hint}</span>
                </div>
              )}
              {pendingChange.source_location && (
                <div className="pending-detail-row">
                  <span className="pending-detail-label">位置</span>
                  <span className="pending-detail-val mono">
                    {pendingChange.source_location.file}:{pendingChange.source_location.line}
                  </span>
                </div>
              )}
            </div>
          )}
          {isService && operatesOn && operatesOn.length > 0 && (
            <div className="member-section">
              <div className="sub-label">协作聚合</div>
              <div className="service-operates-on">
                {operatesOn.map((n) => (
                  <span key={n} className="service-op-tag">{n}</span>
                ))}
              </div>
            </div>
          )}
          {isService && (member.methods?.length || 0) > 0 && (
            <div className="member-section">
              <div className="sub-label">操作</div>
              {member.methods.map((m, i) => (
                <div key={i} className="entity-method-row">
                  <span className="em-name">{m.name}</span>
                  {m.returns && <span className="em-desc">→ {m.returns}</span>}
                </div>
              ))}
              {member.methods.some(m => m.description) && (
                <div className="service-meth-desc">
                  {member.methods.filter(m => m.description).map((m, i) => (
                    <div key={i} className="constraint-row" style={{color: '#9a6700'}}>
                      {m.name.replace(/\(.*\)/, '')}: {m.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isService && attrCount > 0 && (
            <div className="member-section">
              <div className="sub-label">属性</div>
              <table className="attr-table">
                <tbody>
                  {member.attributes.map((a) => (
                    <tr key={a.name}>
                      <td className="attr-name">{a.name}</td>
                      <td className="attr-type">{a.type}</td>
                      <td className="attr-desc">{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {constraintCount > 0 && (
            <div className="member-section">
              <div className="sub-label">约束</div>
              {member.constraints.map((c, i) => (
                <div key={i} className="constraint-row">{c}</div>
              ))}
            </div>
          )}

          {member.frozen && <div className="frozen-badge">frozen (immutable)</div>}

          {!isRoot && methodCount > 0 && (
            <div className="member-section">
              <div className="sub-label">方法</div>
              {member.methods.map((m, i) => (
                <div key={i} className="entity-method-row">
                  <span className="em-name">{m.name}</span>
                  <span className="em-desc">{m.description || ''}</span>
                </div>
              ))}
            </div>
          )}

          {isRoot && invCount > 0 && (
            <Section title="不变量" count={invCount}>
              {invariants.map((inv, i) => (
                <InvariantItem key={i} inv={inv} />
              ))}
            </Section>
          )}

          {isRoot && rootMethodCount > 0 && (
            <Section title="方法契约" count={rootMethodCount}>
              {methods.map((m, i) => (
                <MethodItem key={i} method={m} />
              ))}
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

export default memo(MemberNode);
