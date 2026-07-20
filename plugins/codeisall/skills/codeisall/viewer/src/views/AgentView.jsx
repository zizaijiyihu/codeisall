import React from 'react';

/**
 * Agent 视图 — 展示系统中所有 Agent（Actor）的声明信息
 *
 * Agent 是独立于六边形的自主 Actor，通过 tool 操作领域系统。
 * 这个视图展示：身份、能力（tools）、约束、关联 Context。
 */
export default function AgentView({ model }) {
  const agents = model?.agents || [];

  if (agents.length === 0) {
    return (
      <div className="agent-view-empty">
        <div className="agent-view-empty-icon">🤖</div>
        <div className="agent-view-empty-text">当前项目没有定义 Agent</div>
        <div className="agent-view-empty-hint">
          在 <code>agents/{'<name>'}/manifest.py</code> 中用 <code>@agent</code> 装饰器声明
        </div>
      </div>
    );
  }

  return (
    <div className="agent-view">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} contexts={model.contexts} model={model} />
      ))}
    </div>
  );
}

function AgentCard({ agent, contexts, model }) {
  const queryTools = (agent.tools || []).filter(t => t.direction === 'query');
  const commandTools = (agent.tools || []).filter(t => t.direction === 'command');
  // 兼容旧的 inbound/outbound
  const otherTools = (agent.tools || []).filter(t => t.direction !== 'query' && t.direction !== 'command');
  const relatedCtxNames = (agent.operates_on || []).map(ctxId => {
    const ctx = (contexts || []).find(c => c.id === ctxId);
    return ctx ? ctx.name : ctxId;
  });

  // 索引：query_handler_name → {ctx_id, visibility, returns}
  const queryHandlerIndex = {};
  (contexts || []).forEach(ctx => {
    (ctx.query_handlers || []).forEach(qh => {
      queryHandlerIndex[qh.name] = { ctx_id: ctx.id, ...qh };
    });
  });

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <div className="agent-card-title">
          <span className="agent-card-icon">🤖</span>
          <span className="agent-card-name">{agent.name}</span>
          <span className="agent-card-type-badge">{agent.type === 'tool_use' ? 'Tool-use' : agent.type === 'coding' ? 'Coding' : agent.type}</span>
          <span className="agent-card-framework-badge">{agent.framework}</span>
        </div>
      </div>

      <div className="agent-card-desc">{agent.description}</div>

      <div className="agent-card-meta">
        <div className="agent-meta-row">
          <span className="agent-meta-label">触发方式</span>
          <span className="agent-meta-value">
            {(agent.triggers || []).map((t, i) => (
              <span key={i} className="agent-trigger-tag">{t}</span>
            ))}
          </span>
        </div>
        <div className="agent-meta-row">
          <span className="agent-meta-label">关联 Context</span>
          <span className="agent-meta-value">
            {relatedCtxNames.map((name, i) => (
              <span key={i} className="agent-ctx-tag">{name}</span>
            ))}
          </span>
        </div>
      </div>

      {queryTools.length > 0 && (
        <div className="agent-tools-section">
          <div className="agent-tools-title">🔍 查询工具（不改状态）</div>
          <div className="agent-tools-list">
            {queryTools.map((tool, i) => {
              const handler = tool.maps_to ? queryHandlerIndex[tool.maps_to] : null;
              return (
                <div key={i} className="agent-tool-item inbound">
                  <span className="agent-tool-name">{tool.name}</span>
                  <span className="agent-tool-desc">{tool.description}</span>
                  {tool.source && <span className="agent-tool-source">← {tool.source}</span>}
                  {tool.data_source && <span className="agent-tool-source">← {tool.data_source}</span>}
                  {handler && (
                    <span className="agent-tool-mapping" title={handler.visibility || ''}>
                      → @query_handler {handler.ctx_id}.{tool.maps_to}
                      {handler.visibility && <span className="agent-tool-visibility">🔒 {handler.visibility}</span>}
                    </span>
                  )}
                  {tool.maps_to && !handler && (
                    <span className="agent-tool-mapping missing">⚠ maps_to={tool.maps_to} 找不到对应 @query_handler</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {commandTools.length > 0 && (
        <div className="agent-tools-section">
          <div className="agent-tools-title">⚡ 命令工具（改变状态）</div>
          <div className="agent-tools-list">
            {commandTools.map((tool, i) => (
              <div key={i} className="agent-tool-item outbound">
                <span className="agent-tool-name">{tool.name}</span>
                <span className="agent-tool-desc">{tool.description}</span>
                {tool.target_ctx && <span className="agent-tool-target">→ {tool.target_ctx}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {otherTools.length > 0 && (
        <div className="agent-tools-section">
          <div className="agent-tools-title">🔧 其他工具</div>
          <div className="agent-tools-list">
            {otherTools.map((tool, i) => (
              <div key={i} className="agent-tool-item">
                <span className="agent-tool-name">{tool.name}</span>
                <span className="agent-tool-desc">{tool.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.constraints && agent.constraints.length > 0 && (
        <div className="agent-constraints-section">
          <div className="agent-constraints-title">🚫 约束</div>
          {agent.constraints.map((c, i) => (
            <div key={i} className="agent-constraint-item">· {c}</div>
          ))}
        </div>
      )}

      {agent.skills && agent.skills.length > 0 && (
        <div className="agent-tools-section">
          <div className="agent-tools-title">📚 技能（提示词/知识文件）</div>
          <div className="agent-tools-list">
            {agent.skills.map((skill, i) => (
              <div key={i} className="agent-tool-item skill">
                <span className="agent-tool-name">{skill.name}</span>
                <span className="agent-tool-desc">{skill.description}</span>
                {skill.path && <span className="agent-tool-source">{skill.path}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.cli && agent.cli.length > 0 && (
        <div className="agent-tools-section">
          <div className="agent-tools-title">💻 启动方式</div>
          <div className="agent-tools-list">
            {agent.cli.map((c, i) => (
              <div key={i} className="agent-tool-item cli">
                <span className="agent-tool-name">{c.command} {(c.args || []).join(' ')}</span>
                <span className="agent-tool-desc">{c.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.source_location && (
        <div className="agent-source">
          📄 {agent.source_location.file}:{agent.source_location.line}
        </div>
      )}
    </div>
  );
}
