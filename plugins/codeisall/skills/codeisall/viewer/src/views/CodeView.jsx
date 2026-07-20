import React, { useMemo, useState, useEffect } from 'react';

// 把 code_structure 转成一棵真正的树
function buildTree(model) {
  const root = { name: '/', dirs: {}, files: [] };
  const ensureDir = (path) => {
    const parts = path.split('/').filter(Boolean);
    let cur = root;
    parts.forEach(p => {
      if (!cur.dirs[p]) cur.dirs[p] = { name: p, dirs: {}, files: [] };
      cur = cur.dirs[p];
    });
    return cur;
  };

  // 每个 Context 一个目录
  Object.entries(model.code_structure || {}).forEach(([ctxId, struct]) => {
    const ctxRoot = struct.root.replace(/\/$/, '');
    const ctxNode = ensureDir(ctxRoot);
    ctxNode.kind = 'context';
    ctxNode.contextId = ctxId;
    Object.entries(struct.layers).forEach(([layerKey, layer]) => {
      const layerNode = ensureDir(`${ctxRoot}/${layer.dir.replace(/\/$/, '')}`);
      layerNode.kind = 'layer';
      layerNode.layerKey = layerKey;
      layer.files.forEach(f => {
        // 处理多级文件路径（如 handlers/on_payment.py）
        const parts = f.name.split('/');
        const fname = parts.pop();
        let target = layerNode;
        parts.forEach(p => {
          if (!target.dirs[p]) target.dirs[p] = { name: p, dirs: {}, files: [] };
          target = target.dirs[p];
        });
        target.files.push({
          ...f, fullPath: `${ctxRoot}/${layer.dir}${f.name}`,
          contextId: ctxId, layerKey,
        });
      });
    });
  });

  // shared/
  if (model.shared_infrastructure?.length) {
    model.shared_infrastructure.forEach(item => {
      const parts = item.path.split('/');
      const fname = parts.pop();
      let cur = root;
      parts.forEach(p => {
        if (!cur.dirs[p]) cur.dirs[p] = { name: p, dirs: {}, files: [] };
        cur = cur.dirs[p];
        cur.kind = cur.kind || 'shared';
      });
      cur.files.push({
        name: fname, desc: item.description, fullPath: item.path,
        kind: 'shared', icon: item.icon,
      });
    });
  }

  return root;
}

function TreeNode({ node, depth, focusFile, onSelect, expandedPaths, togglePath, parentPath }) {
  const myPath = `${parentPath}/${node.name}`;
  const expanded = expandedPaths.has(myPath);
  const dirs = Object.values(node.dirs);
  const isCtx = node.kind === 'context';
  const isLayer = node.kind === 'layer';
  const isShared = node.kind === 'shared';

  return (
    <div>
      <div
        className={`tree-row tree-dir kind-${node.kind || 'plain'}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => togglePath(myPath)}
      >
        <span className="tree-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="tree-icon">{isCtx ? '📦' : isLayer ? layerIcon(node.layerKey) : isShared ? '🔧' : '📁'}</span>
        <span className="tree-name">{node.name}/</span>
        {isCtx && <span className="tree-tag">Context</span>}
        {isLayer && <span className="tree-tag">{LAYER_LABEL[node.layerKey]}</span>}
      </div>
      {expanded && (
        <>
          {dirs.map((d) => (
            <TreeNode
              key={d.name}
              node={d}
              depth={depth + 1}
              focusFile={focusFile}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
              parentPath={myPath}
            />
          ))}
          {node.files.map((f) => (
            <div
              key={f.name}
              className={`tree-row tree-file ${focusFile === f.fullPath ? 'focused' : ''}`}
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
              onClick={() => onSelect(f)}
            >
              <span className="tree-icon">{f.icon || '📄'}</span>
              <span className="tree-name">{f.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const LAYER_LABEL = {
  interface: 'Interface',
  application: 'Application',
  domain: 'Domain',
  infrastructure: 'Infrastructure',
};

function layerIcon(key) {
  return { interface: '📡', application: '⚙', domain: '💎', infrastructure: '🔧' }[key] || '📁';
}

function FilePreview({ file, model }) {
  if (!file) {
    return (
      <div className="preview-empty">
        <div className="preview-empty-icon">📄</div>
        <div className="preview-empty-text">从左侧选择文件查看内容预览</div>
      </div>
    );
  }

  // 推断该文件对应的领域概念（多聚合：在所有 aggregates 里找）
  const ctx = file.contextId ? model.contexts.find(c => c.id === file.contextId) : null;
  const mapsToName = inferMapsTo(file, model);
  let agg = null, member = null;
  if (ctx && mapsToName) {
    for (const a of (ctx.aggregates || [])) {
      const m = findMember(a, mapsToName);
      if (m) { agg = a; member = m; break; }
    }
  }
  if (!agg) agg = ctx?.aggregates?.[0];
  const root = agg?.root && typeof agg.root === 'object' ? agg.root : null;

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div className="preview-path">{file.fullPath}</div>
        <div className="preview-desc">{file.desc}</div>
      </div>

      {file.kind === 'shared' ? (
        <div className="preview-body">
          <div className="preview-block">
            <div className="preview-block-title">📦 Shared Infrastructure</div>
            <div className="preview-block-content">
              这是跨 Context 共享的纯技术能力，没有业务语言。
              <br />
              任何 Context 都可以通过 import 引用。
            </div>
          </div>
          {renderSharedSkeleton(file)}
        </div>
      ) : (
        <div className="preview-body">
          {ctx && (
            <div className="preview-block">
              <div className="preview-block-title">所在 Context</div>
              <div className="preview-block-content">
                <span className={`preview-ctx-badge ${ctx.type}`}>{ctx.name}</span>
                <span className="preview-layer">· {LAYER_LABEL[file.layerKey]} 层</span>
              </div>
            </div>
          )}
          {member && (
            <div className="preview-block">
              <div className="preview-block-title">领域概念：{member.name}</div>
              <div className="preview-block-content">
                {renderMemberSkeleton(member, file.layerKey)}
              </div>
            </div>
          )}
          <div className="preview-block">
            <div className="preview-block-title">代码骨架（示例）</div>
            <pre className="preview-code">{renderCodeSkeleton(file, ctx, agg, member)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function inferMapsTo(file, model) {
  if (!file.contextId) return null;
  const ctxStruct = model.code_structure?.[file.contextId];
  if (!ctxStruct) return null;
  for (const layer of Object.values(ctxStruct.layers)) {
    for (const f of layer.files) {
      const fullPath = `${ctxStruct.root}${layer.dir}${f.name}`;
      if (fullPath === file.fullPath) return f.maps_to;
    }
  }
  return null;
}

function findMember(agg, name) {
  if (!agg) return null;
  const root = agg.root && typeof agg.root === 'object' ? agg.root : null;
  if (root?.name === name) return { ...root, kind: 'root' };
  const e = (agg.entities || []).find(x => typeof x === 'object' && x.name === name);
  if (e) return { ...e, kind: 'entity' };
  const v = (agg.value_objects || []).find(x => typeof x === 'object' && x.name === name);
  if (v) return { ...v, kind: 'vo' };
  return null;
}

function renderMemberSkeleton(member, layerKey) {
  if (member.kind === 'root') {
    return (
      <>
        <div>聚合根，含 {member.attributes?.length || 0} 个属性</div>
        {member.attributes?.slice(0, 4).map(a => (
          <div key={a.name} className="preview-attr">
            <code>{a.name}</code>: <code>{a.type}</code> — {a.description}
          </div>
        ))}
      </>
    );
  }
  if (member.kind === 'entity') return <div>实体：含 {member.attributes?.length || 0} 属性 / {member.methods?.length || 0} 方法</div>;
  if (member.kind === 'vo') return <div>值对象 {member.frozen ? '(frozen)' : ''}：含 {member.attributes?.length || 0} 属性 / {member.constraints?.length || 0} 约束</div>;
  return null;
}

function renderCodeSkeleton(file, ctx, agg, member) {
  if (!member) {
    if (file.layerKey === 'infrastructure' && file.name === 'repository.py') {
      const rootName = agg?.root?.name || 'Entity';
      return `# ${file.fullPath}
from ${ctx.id}_ctx.domain.${rootName.toLowerCase()} import ${rootName}, ${rootName}Repository
from shared.db.mysql import MySQLClient

class ${rootName}RepositoryImpl(${rootName}Repository):
    """${ctx.name} Context 的持久化适配器

    依赖反转：实现 domain 层定义的 ${rootName}Repository 接口
    """
    def __init__(self, db: MySQLClient):
        self.db = db

    def save(self, ${rootName.toLowerCase()}: ${rootName}) -> None:
        # SQL 操作 ...
        pass

    def find(self, id) -> ${rootName} | None:
        # SQL 操作 ...
        pass
`;
    }
    if (file.layerKey === 'infrastructure' && file.name === 'publisher.py') {
      return `# ${file.fullPath}
from shared.event_bus import bus

class EventPublisher:
    def publish(self, event_name: str, payload: dict) -> None:
        bus.publish(event_name, payload)
`;
    }
    return `# ${file.fullPath}\n# ${file.desc}`;
  }
  // 有 maps_to 时，渲染 domain 层的骨架
  if (member.kind === 'root') {
    return `# ${file.fullPath}
from dataclasses import dataclass
from ddd.decorators import aggregate_root, command, invariant

@aggregate_root(context="${ctx.id}", description="${ctx.responsibility}")
class ${member.name}:
${(member.attributes || []).map(a => `    ${a.name}: ${a.type}  # ${a.description}`).join('\n')}

${(agg.methods || []).map(m => `    @command(
        emits="${m.event}",
        pre="${m.precondition}",
        post="${m.postcondition}",
        fails="${m.failure || ''}"
    )
    def ${m.name.replace(/\(.*\)/, '')}(self${m.name.includes('(') && !m.name.match(/\(\s*\)/) ? ', ...' : ''}): ...`).join('\n\n')}
`;
  }
  if (member.kind === 'entity') {
    return `# ${file.fullPath}
from ddd.decorators import entity

@entity(context="${ctx.id}")
class ${member.name}:
${(member.attributes || []).map(a => `    ${a.name}: ${a.type}  # ${a.description}`).join('\n')}
`;
  }
  if (member.kind === 'vo') {
    return `# ${file.fullPath}
from dataclasses import dataclass
from ddd.decorators import value_object

@value_object(context="${ctx.id}"${member.frozen ? ', frozen=True' : ''})
@dataclass(frozen=${member.frozen ? 'True' : 'False'})
class ${member.name}:
${(member.attributes || []).map(a => `    ${a.name}: ${a.type}  # ${a.description}`).join('\n')}

    # 约束：
${(member.constraints || []).map(c => `    # - ${c}`).join('\n')}
`;
  }
  return '';
}

function renderSharedSkeleton(file) {
  if (file.name === 'event_bus.py') {
    return (
      <div className="preview-block">
        <div className="preview-block-title">代码骨架（示例）</div>
        <pre className="preview-code">{`# shared/event_bus.py
from typing import Callable

class EventBus:
    """进程内事件总线 - 零业务语义"""
    _handlers: dict[str, list[Callable]] = {}

    def subscribe(self, event_type: str, handler: Callable) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def publish(self, event_type: str, payload: dict) -> None:
        for handler in self._handlers.get(event_type, []):
            handler(payload)

bus = EventBus()
`}</pre>
      </div>
    );
  }
  return null;
}

// 计算 focus.file 对应的路径，并展开所有祖先目录
function expandTo(filePath) {
  const set = new Set(['/']);
  if (!filePath) return set;
  const parts = filePath.split('/').filter(Boolean);
  let acc = '';
  parts.forEach(p => {
    acc += `/${p}`;
    set.add(acc);
  });
  return set;
}

export default function CodeView({ model, focus }) {
  const tree = useMemo(() => buildTree(model), [model]);
  const focusFile = focus?.file || null;
  const [selected, setSelected] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(() => expandTo(focusFile));

  useEffect(() => {
    if (focusFile) {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        expandTo(focusFile).forEach(p => next.add(p));
        return next;
      });
      // 自动选中聚焦的文件
      const found = findFileInTree(tree, focusFile);
      if (found) setSelected(found);
    }
  }, [focusFile, tree]);

  const togglePath = (p) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const dirs = Object.values(tree.dirs);

  return (
    <div className="code-view">
      <div className="code-view-tree">
        <div className="code-view-tree-hdr">📁 项目根目录</div>
        {dirs.map((d) => (
          <TreeNode
            key={d.name}
            node={d}
            depth={0}
            focusFile={focusFile}
            onSelect={setSelected}
            expandedPaths={expandedPaths}
            togglePath={togglePath}
            parentPath=""
          />
        ))}
      </div>
      <div className="code-view-preview">
        <FilePreview file={selected} model={model} />
      </div>
    </div>
  );
}

function findFileInTree(root, fullPath) {
  // DFS
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const f of (cur.files || [])) {
      if (f.fullPath === fullPath) return f;
    }
    for (const d of Object.values(cur.dirs || {})) stack.push(d);
  }
  return null;
}
