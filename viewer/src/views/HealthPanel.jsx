import React, { useEffect, useState } from 'react';

const SEVERITY_META = {
  ERROR: { color: 'red', icon: '❌', label: '错误' },
  WARN: { color: 'yellow', icon: '⚠', label: '警告' },
  INFO: { color: 'blue', icon: 'ℹ', label: '提示' },
};

function HealthBadge({ summary, available, onOpen }) {
  if (!available) {
    return (
      <button className="health-badge disabled" onClick={onOpen} title="ddd-lint 不可用">
        <span className="health-dot dot-gray" />
        <span>无 lint</span>
      </button>
    );
  }
  const { errors, warnings } = summary || { errors: 0, warnings: 0 };
  let dot = 'green', label = '健康';
  if (errors > 0) { dot = 'red'; label = `${errors} 错误`; }
  else if (warnings > 0) { dot = 'yellow'; label = `${warnings} 警告`; }
  return (
    <button className={`health-badge dot-${dot}`} onClick={onOpen} title="点击查看 lint 详情">
      <span className={`health-dot dot-${dot}`} />
      <span className="health-label">{label}</span>
      {errors === 0 && warnings === 0 && <span className="health-check">✓</span>}
      {errors > 0 && <span className="health-count">{errors}</span>}
      {errors === 0 && warnings > 0 && <span className="health-count">{warnings}</span>}
    </button>
  );
}

export default function HealthPanel({ onJumpToCode }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/lint');
      const d = await r.json();
      setData(d);
    } catch (e) {
      setData({ available: false, error: String(e), diagnostics: [], summary: {} });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleClickDiag = (d) => {
    // 把 file 路径映射成代码视图能识别的 fullPath
    // file 是相对 example/ 的：order_ctx/domain/order.py
    // CodeView 的 fullPath 也是这个格式（buildTree 用的就是 ctxRoot/layer/file）
    if (onJumpToCode && d.file) {
      // contextId 从路径前缀推断
      const parts = d.file.split('/');
      const ctxId = parts[0].endsWith('_ctx') ? parts[0].slice(0, -4) : null;
      onJumpToCode(ctxId, d.file);
      setOpen(false);
    }
  };

  const errors = (data?.diagnostics || []).filter(d => d.severity === 'ERROR');
  const warnings = (data?.diagnostics || []).filter(d => d.severity === 'WARN');

  return (
    <>
      <HealthBadge
        summary={data?.summary}
        available={data?.available}
        onOpen={() => setOpen(true)}
      />
      {open && data && (
        <div className="health-overlay" onClick={() => setOpen(false)}>
          <div className="health-modal" onClick={(e) => e.stopPropagation()}>
            <div className="health-modal-hdr">
              <div className="health-modal-title">
                🩺 DDD 建模健康度报告
              </div>
              <div className="health-modal-actions">
                <button className="health-refresh-btn" onClick={load} disabled={refreshing}>
                  {refreshing ? '刷新中…' : '🔄 重新检查'}
                </button>
                <button className="health-close-btn" onClick={() => setOpen(false)}>关闭 ✕</button>
              </div>
            </div>

            {data.available ? (
              <>
                <div className="health-stats">
                  <Stat label="Context" value={data.summary?.total_checks?.contexts} icon="📦" />
                  <Stat label="聚合根" value={data.summary?.total_checks?.aggregates} icon="💎" />
                  <Stat label="集成关系" value={data.summary?.total_checks?.relations} icon="🔗" />
                  <Stat label="事件" value={data.summary?.total_checks?.events} icon="🔥" />
                  <Stat label="业务规则" value={data.summary?.total_checks?.business_rules} icon="📋" />
                  <div className="health-stats-spacer" />
                  <Stat label="ERROR" value={data.summary?.errors || 0} icon="❌" tone={data.summary?.errors > 0 ? 'red' : 'gray'} />
                  <Stat label="WARN" value={data.summary?.warnings || 0} icon="⚠" tone={data.summary?.warnings > 0 ? 'yellow' : 'gray'} />
                </div>

                {errors.length === 0 && warnings.length === 0 && (
                  <div className="health-pass">
                    <div className="health-pass-icon">✅</div>
                    <div className="health-pass-title">所有规则通过</div>
                    <div className="health-pass-sub">领域建模符合规范，可以放心 commit</div>
                  </div>
                )}

                {errors.length > 0 && (
                  <div className="health-section">
                    <div className="health-section-hdr error">
                      ❌ Errors（必须修复）
                      <span className="health-section-count">{errors.length}</span>
                    </div>
                    <div className="health-diag-list">
                      {errors.map((d, i) => (
                        <DiagItem key={i} d={d} onClick={() => handleClickDiag(d)} />
                      ))}
                    </div>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="health-section">
                    <div className="health-section-hdr warn">
                      ⚠ Warnings（建议修复）
                      <span className="health-section-count">{warnings.length}</span>
                    </div>
                    <div className="health-diag-list">
                      {warnings.map((d, i) => (
                        <DiagItem key={i} d={d} onClick={() => handleClickDiag(d)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="health-unavailable">
                <div>ddd-lint 当前不可用</div>
                {data.error && <code className="health-err">{data.error}</code>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, icon, tone }) {
  return (
    <div className={`health-stat ${tone || ''}`}>
      <div className="health-stat-icon">{icon}</div>
      <div className="health-stat-val">{value ?? '-'}</div>
      <div className="health-stat-lbl">{label}</div>
    </div>
  );
}

function DiagItem({ d, onClick }) {
  const sev = SEVERITY_META[d.severity] || SEVERITY_META.INFO;
  return (
    <div className={`health-diag sev-${sev.color}`} onClick={onClick}>
      <div className="health-diag-hdr">
        <span className={`health-diag-sev sev-${sev.color}`}>{d.severity}</span>
        <span className="health-diag-rule">{d.rule}</span>
        <span className="health-diag-loc">{d.file}:{d.line}</span>
      </div>
      <div className="health-diag-msg">{d.message}</div>
      {d.hint && <div className="health-diag-hint">↳ {d.hint}</div>}
      <div className="health-diag-jump">点击 → 跳到代码视图</div>
    </div>
  );
}
