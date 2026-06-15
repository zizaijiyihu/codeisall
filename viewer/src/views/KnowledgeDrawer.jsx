import React, { useMemo, useState } from 'react';

// =============== 知识 → 模型 解析器 ===============

function findAggByRootName(model, rootName) {
  for (const ctx of model.contexts) {
    for (const agg of (ctx.aggregates || [])) {
      const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
      if (root?.name === rootName) return { ctx, agg, root };
    }
  }
  return null;
}

function findMemberAnywhere(model, name) {
  for (const ctx of model.contexts) {
    for (const agg of (ctx.aggregates || [])) {
      const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
      if (root?.name === name) return { ctxId: ctx.id, type: 'root', name };
      for (const e of (agg.entities || [])) {
        if (typeof e === 'object' && e.name === name) return { ctxId: ctx.id, type: 'entity', name };
      }
      for (const v of (agg.value_objects || [])) {
        if (typeof v === 'object' && v.name === name) return { ctxId: ctx.id, type: 'vo', name };
      }
    }
  }
  return null;
}

function nodeIdFor(member) {
  return `${member.ctxId}__${member.name}`;
}

function resolveTerm(term, model, ctxId) {
  // 1. 精确匹配：术语名 === 节点类名（英文 term 对英文 class name）
  const m = findMemberAnywhere(model, term);
  if (m) return [nodeIdFor(m)];
  // 2. 动词术语启发式：术语出现在某个命令的事件名里
  for (const ctx of model.contexts) {
    for (const agg of (ctx.aggregates || [])) {
      const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
      if (!root) continue;
      for (const meth of (agg.methods || [])) {
        if (meth.event && meth.event.toLowerCase().includes(term.toLowerCase())) {
          return [nodeIdFor({ ctxId: ctx.id, name: root.name })];
        }
      }
    }
  }
  // 3. 回退：术语所在 ctx 的所有聚合根作为承接者
  //    理由：中文术语 vs 英文类名无法精确匹配时，术语定义在哪个 ctx，就归那个 ctx 的聚合承接
  if (ctxId) {
    const ctx = model.contexts.find(c => c.id === ctxId);
    if (ctx) {
      const roots = (ctx.aggregates || [])
        .filter(a => a.root && typeof a.root === 'object')
        .map(a => `${ctxId}__${a.root.name}`);
      if (roots.length > 0) return roots;
    }
  }
  return [];
}

function resolveInvariant(inv, ctxId, aggRootName) {
  return [`${ctxId}__${aggRootName}`];
}

function resolveBusinessRule(rule, model) {
  // 新 schema：按 involves（多个聚合）解析
  const ids = new Set();
  const involves = rule.involves || (rule.aggregate ? [rule.aggregate] : []);
  for (const aggName of involves) {
    const found = findAggByRootName(model, aggName);
    if (found) ids.add(`${found.ctx.id}__${found.root.name}`);
  }
  return [...ids];
}

function resolveEvent(evt, model) {
  const ids = new Set();
  // trigger: "Order.place()" → 找根类名
  if (evt.trigger) {
    const triggerCls = evt.trigger.split('.')[0];
    const f = findAggByRootName(model, triggerCls);
    if (f) ids.add(`${f.ctx.id}__${triggerCls}`);
  }
  // consumers
  for (const c of (evt.consumers || [])) {
    const f = findAggByRootName(model, c.aggregate);
    if (f) ids.add(`${f.ctx.id}__${c.aggregate}`);
  }
  return [...ids];
}



// =============== 列表渲染 ===============

function Section({ items, onClick, hoveredId, setHoveredId }) {
  if (items.length === 0) {
    return <div className="kd-empty">该类知识暂无</div>;
  }
  return (
    <div className="kd-list">
      {items.map((it) => {
        const hasOwner = it.owners && it.owners.length > 0;
        return (
          <div
            key={it.key}
            className={`kd-item ${hasOwner ? 'has-owner' : 'orphan'} ${hoveredId === it.key ? 'hovered' : ''}`}
            onMouseEnter={() => { setHoveredId(it.key); onClick(it.owners || []); }}
            onMouseLeave={() => { setHoveredId(null); onClick([]); }}
            onClick={() => onClick(it.owners || [])}
          >
            <span className="kd-item-icon">{it.icon}</span>
            <div className="kd-item-body">
              <div className="kd-item-title">{it.title}</div>
              {it.detail && <div className="kd-item-detail">{it.detail}</div>}
              <div className="kd-item-owners">
                <span className="kd-item-owners-label">承接于</span>
                {hasOwner ? (
                  it.owners.map((o, i) => (
                    <span key={i} className="kd-owner-badge">{o.replace('__', ' › ').replace('ctx-bg-', '🏛 ')}</span>
                  ))
                ) : (
                  <span className="kd-orphan-tag">⚠ 无承接者</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============== 主组件 ===============

const TABS = [
  { id: 'term', label: '统一语言', icon: '📖' },
  { id: 'invariant', label: '不变量', icon: '⚠' },
  { id: 'vo_constraint', label: '值对象约束', icon: '📐' },
  { id: 'business_rule', label: '业务规则', icon: '📋' },
  { id: 'contract', label: '行为契约', icon: '📋' },
  { id: 'event', label: '事件与协作', icon: '🔥' },
];

export default function KnowledgeDrawer({ model, onHighlight }) {
  // 三态：closed / open / fullscreen
  const [mode, setMode] = useState('open');
  const [tab, setTab] = useState('term');
  const [hoveredId, setHoveredId] = useState(null);

  const cycleMode = () => {
    if (mode === 'closed') setMode('open');
    else if (mode === 'open') setMode('closed');
    else setMode('open'); // fullscreen → open
  };
  const toggleFullscreen = () => {
    setMode(mode === 'fullscreen' ? 'open' : 'fullscreen');
  };

  const data = useMemo(() => {
    const out = { term: [], invariant: [], vo_constraint: [], business_rule: [], contract: [], event: [] };
    if (!model) return out;

    // 构建测试覆盖索引：invariant_name → count, command_name:aspect → count
    const testCoverage = {};
    (model.test_coverage || []).forEach((tc) => {
      let key;
      if (tc.type === 'invariant') {
        key = `inv:${tc.context}:${tc.aggregate}:${tc.invariant}`;
      } else {
        key = `cmd:${tc.context}:${tc.aggregate}:${tc.command}:${tc.aspect}`;
      }
      testCoverage[key] = (testCoverage[key] || 0) + 1;
    });
    // 按 command 汇总（不分 aspect）
    const cmdTotal = {};
    (model.test_coverage || []).forEach((tc) => {
      if (tc.type === 'command') {
        const key = `cmd:${tc.context}:${tc.aggregate}:${tc.command}`;
        cmdTotal[key] = (cmdTotal[key] || 0) + 1;
      }
    });

    // ========== 📖 统一语言：@term + @routing_rule ==========
    model.contexts.forEach((ctx) => {
      (ctx.ubiquitous_language || []).forEach((t, i) => {
        out.term.push({
          key: `term-${ctx.id}-${i}`,
          icon: '📖',
          title: `「${t.term}」`,
          detail: `${t.definition}${t.confusion ? '　🌀 ' + t.confusion : ''}`,
          owners: resolveTerm(t.term, model, ctx.id),
          ctxId: ctx.id,
        });
      });
    });

    // ========== ⚠ 约束：@invariant + @vo_constraint + @business_rule ==========
    model.contexts.forEach((ctx) => {
      (ctx.aggregates || []).forEach((agg, ai) => {
        const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
        // 聚合根不变量
        (agg.invariants || []).forEach((inv, i) => {
          const obj = typeof inv === 'string' ? { description: inv } : inv;
          // 测试覆盖：test_coverage 里 invariant 字段是方法名（如 _inv_submitted_content_frozen）
          // invariant 在 model 里没有方法名，但 source_location 有行号，可以用 description 做 fallback
          // 最可靠的方式：test_coverage 按 (context, aggregate, invariant) 精确匹配
          const matchedTests = (model.test_coverage || []).filter(tc =>
            tc.type === 'invariant' && tc.context === ctx.id && tc.aggregate === (root?.name || '')
          );
          // 按 invariant 在列表中的 index 分配（test_coverage 里的 invariant 名指向具体方法）
          // 汇总该聚合所有 invariant 测试数
          const myInvTests = matchedTests.filter(tc => {
            const tcInv = tc.invariant || '';
            // 尝试用 fields 关键词匹配
            if (obj.fields && obj.fields.length > 0) {
              return obj.fields.some(f => tcInv.toLowerCase().includes(f.toLowerCase()));
            }
            return false;
          });
          const testCount = myInvTests.length;
          const coverageLabel = testCount > 0 ? `✅ ${testCount} tests` : '⚠️ 未覆盖';
          out.invariant.push({
            key: `inv-${ctx.id}-${ai}-${i}`,
            icon: '⚠',
            title: `${obj.description}　${coverageLabel}`,
            detail: (root ? `[${root.name}] ` : '') + (obj.formal
              ? `形式化：${obj.formal}　·　涉及字段：${(obj.fields || []).join(', ')}`
              : ''),
            owners: root ? resolveInvariant(obj, ctx.id, root.name) : [],
          });
        });
        // 值对象约束
        (agg.value_objects || []).filter(v => typeof v === 'object').forEach((vo, vi) => {
          (vo.constraints || []).forEach((c, ci) => {
            out.vo_constraint.push({
              key: `voc-${ctx.id}-${ai}-${vi}-${ci}`,
              icon: '📐',
              title: `${vo.name}：${c}`,
              detail: `[值对象约束] ${ctx.name}`,
              owners: [`${ctx.id}__${vo.name}`],
            });
          });
        });
      });
    });
    // 业务规则合入约束（新 schema：involves + enforced_by + 多步规则按 id 聚合）
    const businessRulesById = new Map();  // id → [rules...] 用于多步规则聚合
    const standaloneRules = [];
    (model.business_rules || []).forEach((r) => {
      if (r.id) {
        if (!businessRulesById.has(r.id)) businessRulesById.set(r.id, []);
        businessRulesById.get(r.id).push(r);
      } else {
        standaloneRules.push(r);
      }
    });

    // 单步业务规则
    standaloneRules.forEach((r, i) => {
      const involves = r.involves || (r.aggregate ? [r.aggregate] : []);
      const enforcer = r.enforced_by;
      const enforcerType = r.enforced_by_type || 'unknown';
      const enforcerBadge = enforcerType === 'event_handler' ? '⚡ event handler'
        : enforcerType === 'domain_service_method' ? '🤝 domain service'
        : '⚠️ 未挂载守护代码';
      const involvesStr = involves.length > 0 ? `涉及：${involves.join(' + ')}` : '';
      const enforcerStr = enforcer ? `守护：${enforcer}` : '⚠️ 无守护代码';
      const sourceStr = r.source ? `来源：${r.source}` : '';
      const timingStr = r.timing ? `时机：${r.timing}` : '';
      out.business_rule.push({
        key: `rule-${i}`,
        icon: '📋',
        title: `${r.rule}　${enforcerBadge}`,
        detail: [involvesStr, enforcerStr, sourceStr, timingStr].filter(Boolean).join('　·　'),
        owners: resolveBusinessRule(r, model),
      });
    });

    // 多步业务规则（按 id 聚合）
    businessRulesById.forEach((rules, id) => {
      const first = rules[0];
      const involves = first.involves || [];
      const steps = first.steps || rules.map(r => r.enforced_by || '?');
      const handlers = rules.map(r => r.enforced_by).filter(Boolean);
      out.business_rule.push({
        key: `rule-saga-${id}`,
        icon: '🔄',
        title: `${first.rule}　🔄 多步规则 (${rules.length} 个 handler)`,
        detail: `id=${id}　·　涉及：${involves.join(' + ')}　·　步骤：${steps.join(' → ')}`,
        owners: handlers.flatMap(h => resolveBusinessRule({...first, enforced_by: h}, model)),
      });
    });

    // ========== 📋 行为契约：@command 的 pre/post/emits/fails ==========
    model.contexts.forEach((ctx) => {
      (ctx.aggregates || []).forEach((agg) => {
        const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
        if (!root) return;
        (agg.methods || []).forEach((cmd, ci) => {
          const parts = [];
          if (cmd.precondition) parts.push(`前置：${cmd.precondition}`);
          if (cmd.postcondition) parts.push(`后置：${cmd.postcondition}`);
          if (cmd.event && cmd.event !== '无') parts.push(`事件：${cmd.event}`);
          if (cmd.failure) parts.push(`失败：${cmd.failure}`);
          // 测试覆盖：按 command name 匹配（cmd.name 格式 "place()" 或 "submit(approver_id)"）
          const cmdBaseName = cmd.name.split('(')[0];
          const cmdTests = (model.test_coverage || []).filter(tc =>
            tc.type === 'command' && tc.context === ctx.id && tc.aggregate === root.name && tc.command === cmdBaseName
          ).length;
          const coverageLabel = cmdTests > 0 ? `✅ ${cmdTests} tests` : '⚠️ 未覆盖';
          out.contract.push({
            key: `cmd-${ctx.id}-${root.name}-${ci}`,
            icon: '📋',
            title: `${root.name}.${cmd.name}　${coverageLabel}`,
            detail: parts.join('　·　'),
            owners: [`${ctx.id}__${root.name}`],
          });
        });
      });
    });

    // ========== 🔥 事件与协作：events + domain_service.operates_on ==========
    (model.events || []).forEach((evt, i) => {
      const consumerStr = (evt.consumers || []).map(c => `${c.context}.${c.aggregate}.${c.method}`).join(', ') || '无消费者';
      const nonConsumerStr = (evt.non_consumers || []).map(nc => `${nc.context}（${nc.reason}）`).join('; ');
      out.event.push({
        key: `evt-${i}`,
        icon: '🔥',
        title: evt.name,
        detail: `触发：${evt.trigger || '(声明式)'}　·　消费者：${consumerStr}` +
                (nonConsumerStr ? `\n非消费者：${nonConsumerStr}` : ''),
        owners: resolveEvent(evt, model),
      });
    });
    // 领域服务协作关系
    model.contexts.forEach((ctx) => {
      (ctx.aggregates || []).forEach((agg) => {
        (agg.domain_services || []).forEach((svc, si) => {
          if (!svc.operates_on || svc.operates_on.length === 0) return;
          const svcOwners = [`${ctx.id}__svc__${svc.name}`];
          // 协作的聚合根也加入 owners（高亮时全部亮起来）
          (svc.operates_on || []).forEach((opName) => {
            const found = findMemberAnywhere(model, opName);
            if (found) svcOwners.push(nodeIdFor(found));
          });
          out.event.push({
            key: `svc-${ctx.id}-${si}`,
            icon: '🤝',
            title: `${svc.name} 协作`,
            detail: `${svc.description || ''}　·　协作聚合：${svc.operates_on.join(', ')}`,
            owners: svcOwners,
          });
        });
      });
    });

    return out;
  }, [model]);

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const orphanCounts = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v.filter(it => !it.owners || it.owners.length === 0).length])
  );

  return (
    <div className={`knowledge-drawer ${mode}`}>
      <div className="kd-header">
        <div className="kd-title">📚 领域知识地图</div>
        <div className="kd-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`kd-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
              <span className="kd-tab-count">{counts[t.id]}</span>
              {orphanCounts[t.id] > 0 && (
                <span className="kd-tab-orphan" title={`${orphanCounts[t.id]} 条知识无承接者`}>⚠{orphanCounts[t.id]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="kd-actions">
          {mode !== 'closed' && (
            <button className="kd-fullscreen-btn" onClick={toggleFullscreen} title={mode === 'fullscreen' ? '退出全屏' : '全屏查看'}>
              {mode === 'fullscreen' ? '⊡' : '⊞'}
            </button>
          )}
          <button className="kd-toggle" onClick={cycleMode}>
            {mode === 'closed' ? '展开 ▴' : '收起 ▾'}
          </button>
        </div>
      </div>
      {mode !== 'closed' && (
        <div className="kd-body">
          <div className="kd-hint">
            💡 鼠标悬停或点击任一条知识，画布上的承接者节点会高亮。<span className="kd-hint-orphan">「⚠ 无承接者」</span>提示模型有遗漏。
          </div>
          <Section
            items={data[tab]}
            onClick={onHighlight}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
        </div>
      )}
    </div>
  );
}
