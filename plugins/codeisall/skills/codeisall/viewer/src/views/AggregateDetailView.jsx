import React, { useState } from 'react';

function AttrTable({ attrs }) {
  if (!attrs || attrs.length === 0) return null;
  return (
    <table className="attr-table">
      <tbody>
        {attrs.map((a) => (
          <tr key={a.name}>
            <td className="attr-name">{a.name}</td>
            <td className="attr-type">{a.type}</td>
            <td className="attr-desc">{a.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MethodCard({ m }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="meth">
      <div className="meth-hdr" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {m.name}
      </div>
      {open && (
        <div className="meth-detail">
          <div className="md-row"><span className="md-label">前置</span><span className="md-val">{m.precondition}</span></div>
          {m.operation && <div className="md-row"><span className="md-label">操作</span><span className="md-val">{m.operation}</span></div>}
          <div className="md-row"><span className="md-label">后置</span><span className="md-val">{m.postcondition}</span></div>
          <div className="md-row"><span className="md-label">事件</span><span className="md-val ev">{m.event}</span></div>
          <div className="md-row"><span className="md-label">不做</span><span className="md-val nd">{m.not_do}</span></div>
          {m.failure && <div className="md-row"><span className="md-label">失败</span><span className="md-val fail">{m.failure}</span></div>}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member, type, extra }) {
  const typeLabel = { root: 'Aggregate Root', entity: 'Entity', vo: 'Value Object' }[type];
  return (
    <div className={`agg-member type-${type}`}>
      <div className="agg-member-hdr">
        <span className={`member-type-badge ${type}`}>{typeLabel}</span>
        <span className="member-node-name">{member.name}</span>
        {member.frozen && <span className="frozen-badge">frozen</span>}
      </div>
      {member.description && <div className="member-node-desc">{member.description}</div>}
      <AttrTable attrs={member.attributes} />
      {member.constraints && member.constraints.length > 0 && (
        <div className="member-section">
          <div className="sub-label">约束</div>
          {member.constraints.map((c, i) => (
            <div key={i} className="constraint-row">{c}</div>
          ))}
        </div>
      )}
      {type === 'entity' && member.methods && member.methods.length > 0 && (
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
      {type === 'root' && extra?.invariants && extra.invariants.length > 0 && (
        <div className="member-section">
          <div className="sub-label">不变量 <span className="sub-count">{extra.invariants.length}</span></div>
          {extra.invariants.map((inv, i) => (
            <div key={i} className="inv-item">
              <div className="inv-row">{typeof inv === 'string' ? inv : inv.description}</div>
              {typeof inv !== 'string' && (
                <div className="inv-detail">
                  <div className="inv-formal">{inv.formal}</div>
                  <div className="inv-fields">涉及: {inv.fields.join(', ')}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {type === 'root' && extra?.methods && extra.methods.length > 0 && (
        <div className="member-section">
          <div className="sub-label">方法契约 <span className="sub-count">{extra.methods.length}</span></div>
          {extra.methods.map((m, i) => <MethodCard key={i} m={m} />)}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ svc, businessRules }) {
  return (
    <div className="agg-member type-service">
      <div className="agg-member-hdr">
        <span className="member-type-badge service">Domain Service</span>
        <span className="member-node-name">{svc.name}</span>
      </div>
      {svc.description && <div className="member-node-desc">{svc.description}</div>}
      {svc.operates_on && svc.operates_on.length > 0 && (
        <div className="member-section">
          <div className="sub-label">协作聚合</div>
          <div className="constraint-row">{svc.operates_on.join(' · ')}</div>
        </div>
      )}
      {svc.methods && svc.methods.length > 0 && (
        <div className="member-section">
          <div className="sub-label">操作 <span className="sub-count">{svc.methods.length}</span></div>
          {svc.methods.map((m, i) => (
            <div key={i} className="entity-method-row" style={{flexDirection:'column',alignItems:'flex-start',gap:'2px'}}>
              <div>
                <span className="em-name">{m.name}</span>
                {m.returns && <span className="em-desc"> → {m.returns}</span>}
              </div>
              {m.description && <div className="em-desc" style={{paddingLeft:'0'}}>{m.description}</div>}
            </div>
          ))}
        </div>
      )}
      {businessRules && businessRules.length > 0 && (
        <div className="member-section">
          <div className="sub-label">业务规则 <span className="sub-count">{businessRules.length}</span></div>
          {businessRules.map((br, i) => (
            <div key={i} className="inv-item">
              <div className="inv-row">{br.rule}</div>
              <div className="inv-detail">
                {br.id && <div className="inv-fields">id: {br.id}</div>}
                {br.involves && <div className="inv-fields">涉及: {br.involves.join(' + ')}</div>}
                {br.source && <div className="inv-fields">来源: {br.source}</div>}
                {br.timing && <div className="inv-fields">时机: {br.timing}</div>}
                {br.steps && <div className="inv-fields">步骤: {br.steps.join(' → ')}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AggregateDetailView({ model, contextId, focusMember, onClose }) {
  const ctx = model.contexts.find(c => c.id === contextId);
  if (!ctx) return null;
  const allAggs = (ctx.aggregates || []).filter(a => a.root && typeof a.root === 'object');
  // 收集本 ctx 下所有 domain_service（散落在多个聚合的 domain_services 字段里）
  const allServices = [];
  (ctx.aggregates || []).forEach(a => (a.domain_services || []).forEach(s => allServices.push(s)));

  // focusMember 可能指向：聚合根 / entity / VO / domain_service
  // 先看是否是 service —— 是则走 service 渲染分支
  const focusedService = focusMember
    ? allServices.find(s => s.name === focusMember)
    : null;

  if (focusedService) {
    // 该 service 关联的 business_rule（按 enforced_by 前缀匹配 ctx.service.method）
    const enforcerPrefix = `${ctx.id}.${focusedService.name}.`;
    const relatedRules = (model.business_rules || [])
      .filter(br => (br.enforced_by || '').startsWith(enforcerPrefix));
    return (
      <div className="agg-detail-overlay" onClick={onClose}>
        <div className="agg-detail-panel" onClick={(e) => e.stopPropagation()}>
          <div className="agg-detail-header">
            <div>
              <span className="agg-detail-ctxname">{ctx.name}</span>
              <span className="agg-detail-arrow">›</span>
              <span className="agg-detail-aggname">领域服务</span>
              <span className="agg-detail-arrow">›</span>
              <span className="agg-detail-focus">{focusedService.name}</span>
            </div>
            <button className="agg-detail-close" onClick={onClose}>关闭 ✕</button>
          </div>
          <div className="agg-detail-body">
            <ServiceCard svc={focusedService} businessRules={relatedRules} />
            <button className="agg-detail-showall" onClick={() => onClose()}>← 返回</button>
          </div>
        </div>
      </div>
    );
  }

  // 多聚合：根据 focusMember 找到对应的聚合，否则取第一个
  let agg = allAggs[0];
  if (focusMember) {
    const found = allAggs.find(a => {
      if (a.root?.name === focusMember) return true;
      if ((a.entities || []).some(e => typeof e === 'object' && e.name === focusMember)) return true;
      if ((a.value_objects || []).some(v => typeof v === 'object' && v.name === focusMember)) return true;
      return false;
    });
    if (found) agg = found;
  }
  if (!agg) return null;
  const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
  const entities = (agg.entities || []).filter(e => typeof e === 'object');
  const vos = (agg.value_objects || []).filter(v => typeof v === 'object');

  const isFocus = (name) => focusMember === name;

  return (
    <div className="agg-detail-overlay" onClick={onClose}>
      <div className="agg-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="agg-detail-header">
          <div>
            <span className="agg-detail-ctxname">{ctx.name}</span>
            <span className="agg-detail-arrow">›</span>
            <span className="agg-detail-aggname">{agg.name} 聚合</span>
            {focusMember && (
              <>
                <span className="agg-detail-arrow">›</span>
                <span className="agg-detail-focus">{focusMember}</span>
              </>
            )}
          </div>
          <button className="agg-detail-close" onClick={onClose}>关闭 ✕</button>
        </div>

        <div className="agg-detail-body">
          {root && (!focusMember || isFocus(root.name)) && (
            <MemberCard member={root} type="root" extra={{ invariants: agg.invariants, methods: agg.methods }} />
          )}
          {entities.filter(e => !focusMember || isFocus(e.name)).map((e) => (
            <MemberCard key={e.name} member={e} type="entity" />
          ))}
          {vos.filter(v => !focusMember || isFocus(v.name)).map((v) => (
            <MemberCard key={v.name} member={v} type="vo" />
          ))}
          {focusMember && (
            <button className="agg-detail-showall" onClick={() => onClose()}>← 返回</button>
          )}
        </div>

        {agg.not_responsible_details && agg.not_responsible_details.length > 0 && !focusMember && (
          <div className="agg-detail-nr">
            <div className="sub-label">本聚合不负责</div>
            <table className="nr-table">
              <thead><tr><th>职责</th><th>归属</th><th>协作</th></tr></thead>
              <tbody>
                {agg.not_responsible_details.map((nr, i) => (
                  <tr key={i}>
                    <td>{nr.responsibility}</td>
                    <td>{nr.owner}</td>
                    <td>{nr.collaboration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
