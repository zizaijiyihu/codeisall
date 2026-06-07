import React, { useState, useEffect, useCallback } from 'react';
import '@xyflow/react/dist/style.css';
import DomainView from './views/DomainView';
import ArchitectureView from './views/ArchitectureView';
import CodeView from './views/CodeView';
import AgentView from './views/AgentView';
import AggregateDetailView from './views/AggregateDetailView';
import KnowledgeDrawer from './views/KnowledgeDrawer';
import HealthPanel from './views/HealthPanel';

const VIEWS = [
  { id: 'domain', name: '领域视图', icon: '💎', desc: '业务概念 + 事件流' },
  { id: 'architecture', name: '架构视图', icon: '🏗', desc: '分层 + 跨层依赖' },
  { id: 'agent', name: 'Agent 视图', icon: '🤖', desc: 'Agent 定义 + 工具 + 约束' },
  { id: 'code', name: '代码视图', icon: '📁', desc: '文件树 + 装饰器' },
];

export default function App() {
  const [model, setModel] = useState(null);
  const [view, setView] = useState('domain');
  const [focus, setFocus] = useState(null);
  const [aggregatePopup, setAggregatePopup] = useState(null);
  const [highlightIds, setHighlightIds] = useState(new Set());
  // codeisall: 待修改清单（Claude 写入，看板高亮显示）
  // 结构：Map<node_id, { change_type, reason, prompt_hint?, source_location? }>
  const [pendingMap, setPendingMap] = useState(new Map());

  useEffect(() => {
    fetch('/api/model').then(r => r.json()).then(setModel);
  }, []);

  // 定时拉 pending-changes —— Claude 可能在用户和看板交互期间随时写入
  useEffect(() => {
    const load = () => {
      fetch('/api/pending-changes')
        .then(r => r.json())
        .then(data => {
          const m = new Map();
          (data.items || []).forEach(it => {
            if (it.node_id) m.set(it.node_id, it);
          });
          setPendingMap(m);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const jumpToArch = useCallback((contextId, member) => {
    setFocus({ contextId, member });
    setView('architecture');
  }, []);

  const jumpToCode = useCallback((contextId, file) => {
    setFocus({ contextId, file });
    setView('code');
  }, []);

  const showAggregateDetail = useCallback((contextId, member) => {
    setAggregatePopup({ contextId, member });
  }, []);

  // Context 详情弹窗（跟 AggregateDetailView 同级，全局渲染）
  const [ctxPopup, setCtxPopup] = useState(null);
  const showContextDetail = useCallback((ctxData) => {
    setCtxPopup(ctxData);
  }, []);

  const handleHighlight = useCallback((ids) => {
    setHighlightIds(new Set(ids));
  }, []);

  const navigateTo = (id) => {
    setView(id);
    if (id === 'domain') setFocus(null);
  };

  const clearPending = () => {
    fetch('/api/pending-changes', { method: 'DELETE' })
      .then(() => setPendingMap(new Map()))
      .catch(() => {});
  };

  const currentIdx = VIEWS.findIndex(v => v.id === view);

  return (
    <div className="app-container">
      <div className="header">
        <h1>codeisall</h1>
        <div className="breadcrumb">
          {VIEWS.map((v, i) => (
            <React.Fragment key={v.id}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <span
                className={`crumb ${view === v.id ? 'active' : 'clickable'}`}
                onClick={() => navigateTo(v.id)}
                title={v.desc}
              >
                {v.icon} {v.name}
              </span>
            </React.Fragment>
          ))}
        </div>
        <HealthPanel onJumpToCode={jumpToCode} />
        {pendingMap.size > 0 && (
          <div className="pending-banner">
            <span className="pending-banner-icon">🔥</span>
            <span className="pending-banner-text">
              codeisall 标记 <b>{pendingMap.size}</b> 处待修改
            </span>
            <button className="pending-banner-clear" onClick={clearPending} title="完成全部修改并验证后清空">
              清空
            </button>
          </div>
        )}
      </div>

      <div className="flow-wrapper">
        {!model && <div className="loading">加载中…</div>}
        {model && view === 'domain' && (
          <DomainView
            model={model}
            onShowDetail={showAggregateDetail}
            onShowCtxDetail={showContextDetail}
            onJumpToArch={jumpToArch}
            highlightIds={highlightIds}
            pendingMap={pendingMap}
          />
        )}
        {model && view === 'architecture' && (
          <ArchitectureView
            model={model}
            focus={focus}
            onJumpToCode={jumpToCode}
          />
        )}
        {model && view === 'code' && (
          <CodeView model={model} focus={focus} />
        )}
        {model && view === 'agent' && (
          <AgentView model={model} />
        )}
      </div>

      {model && view === 'domain' && (
        <KnowledgeDrawer model={model} onHighlight={handleHighlight} />
      )}

      {model && aggregatePopup && (
        <AggregateDetailView
          model={model}
          contextId={aggregatePopup.contextId}
          focusMember={aggregatePopup.member}
          onClose={() => setAggregatePopup(null)}
        />
      )}

      {ctxPopup && (
        <div className="agg-detail-overlay" onClick={() => setCtxPopup(null)}>
          <div className="ctx-detail-global-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ctx-detail-popup-header">
              <span className="ctx-detail-popup-title">{ctxPopup.name}</span>
              <span className={`ctx-bg-badge ${ctxPopup.type}`}>
                {{ core: '核心域', supporting: '支撑域', generic: '通用域' }[ctxPopup.type] || ctxPopup.type}
              </span>
              <button className="ctx-detail-popup-close" onClick={() => setCtxPopup(null)}>✕</button>
            </div>
            <div className="ctx-detail-popup-body">
              <div className="ctx-bg-resp">{ctxPopup.responsibility}</div>
              {ctxPopup.type_rationale && (
                <div className="ctx-bg-rationale">{ctxPopup.type_rationale}</div>
              )}
              {ctxPopup.not_responsible && ctxPopup.not_responsible.length > 0 && (
                <div className="ctx-bg-nr">
                  {ctxPopup.not_responsible.map((nr) => (
                    <span key={nr} className="nr-tag">{nr}</span>
                  ))}
                </div>
              )}
              {ctxPopup.ubiquitous_language && ctxPopup.ubiquitous_language.length > 0 && (
                <div className="member-section">
                  <div className="sub-label">统一语言</div>
                  <table className="ul-table">
                    <thead><tr><th>术语</th><th>定义</th><th>易混淆</th></tr></thead>
                    <tbody>
                      {ctxPopup.ubiquitous_language.map((t, i) => (
                        <tr key={i}>
                          <td className="ul-term">{t.term}</td>
                          <td>{t.definition}</td>
                          <td className="ul-confuse">{t.confusion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ctxPopup.routing_rules && ctxPopup.routing_rules.length > 0 && (
                <div className="member-section">
                  <div className="sub-label">路由规则</div>
                  <table className="rr-table">
                    <thead><tr><th>关键词</th><th>归属</th><th>不归属</th></tr></thead>
                    <tbody>
                      {ctxPopup.routing_rules.map((r, i) => (
                        <tr key={i}>
                          <td>{r.keyword}</td>
                          <td className="rr-belongs">{r.belongs}</td>
                          <td className="rr-not">{r.not_belongs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
