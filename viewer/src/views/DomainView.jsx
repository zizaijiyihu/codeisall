import React, { useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
} from '@xyflow/react';
import Dagre from '@dagrejs/dagre';
import MemberNode from '../nodes/MemberNode';
import ContextBgNode from '../nodes/ContextBgNode';
import EventEdge from '../edges/EventEdge';

const nodeTypes = { member: MemberNode, contextBg: ContextBgNode };
const edgeTypes = { event: EventEdge };

const ROOT_W = 320;
const ROOT_H = 110;
const CHILD_W = 300;
const CHILD_H = 100;
const CHILD_GAP_X = 60;
const CHILD_OFFSET_Y = 200;
const CTX_PAD = 40;
const CTX_HDR = 60;

function buildLayout(model, callbacks, highlightIds, pendingMap) {
  const { onShowDetail, onJumpToArch, onShowCtxDetail } = callbacks;
  const isHL = (id) => highlightIds && highlightIds.has(id);
  const getPending = (id) => (pendingMap && pendingMap.get(id)) || null;
  const nodes = [];
  const edges = [];

  const g = new Dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 280, ranksep: 360, marginx: 80, marginy: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const rootIds = {};        // ctx_id -> primary root_id（用于 relations 连线）
  const allRootIdsByCtx = {};// ctx_id -> [所有聚合根 id]（用于 context bg 框选）
  const serviceIdsByCtx = {};// ctx_id -> [所有 service id]（也参与 ctx bg 框选）
  const childrenMap = {};

  model.contexts.forEach((ctx) => {
    const aggregates = (ctx.aggregates || []).filter(a => a.root && typeof a.root === 'object');
    allRootIdsByCtx[ctx.id] = [];
    serviceIdsByCtx[ctx.id] = [];

    // === 空 Context：仅战略层定义、尚无战术层 ===
    // 仍渲染 ctx 框 + 一个占位节点（提示"等待战术设计"）
    // 这是设计阶段的合法中间态：先做战略（manifest.py）再做战术（domain/）
    if (aggregates.length === 0) {
      const placeholderId = `${ctx.id}__empty_placeholder`;
      allRootIdsByCtx[ctx.id].push(placeholderId);
      g.setNode(placeholderId, { width: ROOT_W, height: ROOT_H });
      nodes.push({
        id: placeholderId,
        type: 'member',
        position: { x: 0, y: 0 },
        data: {
          member: {
            name: ctx.name,
            description: '该 Context 仅有战略层定义（术语、边界、路由），等待战术建模',
            attributes: [],
          },
          memberType: 'empty',
          contextId: ctx.id, contextName: ctx.name, contextType: ctx.type,
          highlighted: isHL(placeholderId),
          pendingChange: getPending(placeholderId),
        },
      });
      return;
    }

    aggregates.forEach((agg, aggIdx) => {
      const root = agg.root;
      const rootId = `${ctx.id}__${root.name}`;
      allRootIdsByCtx[ctx.id].push(rootId);
      if (aggIdx === 0) rootIds[ctx.id] = rootId;  // 第一个作为 ctx 主聚合（relations 锚点）

      const entities = (agg.entities || []).filter(e => typeof e === 'object');
      const vos = (agg.value_objects || []).filter(v => typeof v === 'object');
      // services 不再作为聚合根的 child，独立成 Dagre 顶级节点
      const childCount = entities.length + vos.length;
      const clusterW = childCount > 0
        ? Math.max(ROOT_W, childCount * CHILD_W + (childCount - 1) * CHILD_GAP_X)
        : ROOT_W;
      const clusterH = childCount > 0 ? ROOT_H + CHILD_OFFSET_Y + CHILD_H : ROOT_H;
      g.setNode(rootId, { width: clusterW, height: clusterH });

      nodes.push({
        id: rootId,
        type: 'member',
        position: { x: 0, y: 0 },
        data: {
          member: root, memberType: 'root',
          contextId: ctx.id, contextName: ctx.name, contextType: ctx.type,
          invariants: agg.invariants, methods: agg.methods,
          onShowDetail, onJumpToArch,
          highlighted: isHL(rootId),
          pendingChange: getPending(rootId),
        },
      });

      const children = [];
      entities.forEach((e) => {
        const memberId = `${ctx.id}__${e.name}`;
        children.push(memberId);
        nodes.push({
          id: memberId, type: 'member', position: { x: 0, y: 0 },
          data: {
            member: e, memberType: 'entity',
            contextId: ctx.id, contextName: ctx.name, contextType: ctx.type,
            onShowDetail, onJumpToArch,
            highlighted: isHL(memberId),
            pendingChange: getPending(memberId),
          },
        });
        edges.push({
          id: `${rootId}--${memberId}`, source: rootId, target: memberId,
          label: 'owns',
          style: { stroke: '#1a7f37', strokeWidth: 2 },
          labelStyle: { fontSize: 13, fill: '#1a7f37', fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
          labelBgPadding: [6, 4],
          markerEnd: { type: MarkerType.ArrowClosed, color: '#1a7f37', width: 14, height: 14 },
        });
      });
      vos.forEach((v) => {
        const memberId = `${ctx.id}__${v.name}`;
        children.push(memberId);
        nodes.push({
          id: memberId, type: 'member', position: { x: 0, y: 0 },
          data: {
            member: v, memberType: 'vo',
            contextId: ctx.id, contextName: ctx.name, contextType: ctx.type,
            onShowDetail, onJumpToArch,
            highlighted: isHL(memberId),
            pendingChange: getPending(memberId),
          },
        });
        edges.push({
          id: `${rootId}--${memberId}`, source: rootId, target: memberId,
          label: 'uses',
          style: { stroke: '#8250df', strokeWidth: 1.5, strokeDasharray: '6 3' },
          labelStyle: { fontSize: 13, fill: '#8250df', fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
          labelBgPadding: [6, 4],
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8250df', width: 14, height: 14 },
        });
      });
      childrenMap[rootId] = children;
    });
  });

  // ========== 领域服务作为独立 Dagre 顶级节点 + operates_on 作为 Dagre 边 ==========
  model.contexts.forEach((ctx) => {
    const aggregates = (ctx.aggregates || []).filter(a => a.root && typeof a.root === 'object');
    if (aggregates.length === 0) return;

    const knownNodes = new Map();
    aggregates.forEach((agg) => {
      const root = agg.root;
      knownNodes.set(root.name, `${ctx.id}__${root.name}`);
      (agg.entities || []).filter(e => typeof e === 'object').forEach(e => {
        knownNodes.set(e.name, `${ctx.id}__${e.name}`);
      });
      (agg.value_objects || []).filter(v => typeof v === 'object').forEach(v => {
        knownNodes.set(v.name, `${ctx.id}__${v.name}`);
      });
    });

    aggregates.forEach((agg) => {
      (agg.domain_services || []).forEach((svc) => {
        const svcId = `${ctx.id}__svc__${svc.name}`;
        serviceIdsByCtx[ctx.id].push(svcId);
        // 把 service 也注册为 Dagre 顶级节点
        g.setNode(svcId, { width: ROOT_W, height: ROOT_H + 40 });
        nodes.push({
          id: svcId, type: 'member', position: { x: 0, y: 0 },
          data: {
            member: {
              name: svc.name, description: svc.description,
              attributes: [], methods: svc.methods,
            },
            memberType: 'service',
            contextId: ctx.id, contextName: ctx.name, contextType: ctx.type,
            operatesOn: svc.operates_on,
            onShowDetail, onJumpToArch,
            highlighted: isHL(svcId),
            pendingChange: getPending(svcId),
          },
        });
        // operates_on 关系既是 Dagre 边（影响布局），也是可视化的 ReactFlow 边
        // weight 加大：让 Dagre 把 svc 紧贴所属聚合，避免被跨 ctx 事件边拉走
        (svc.operates_on || []).forEach((opName) => {
          const targetId = knownNodes.get(opName);
          if (targetId) {
            g.setEdge(svcId, targetId, { weight: 10 });
            edges.push({
              id: `svc-${svcId}-${opName}`,
              source: svcId, target: targetId,
              label: '协作',
              style: { stroke: '#bf8700', strokeWidth: 3, strokeDasharray: '10 4' },
              labelStyle: { fontSize: 12, fill: '#9a6700', fontWeight: 700 },
              labelBgStyle: { fill: '#fff8c5', fillOpacity: 0.95 },
              labelBgPadding: [6, 4],
              markerEnd: { type: MarkerType.ArrowClosed, color: '#bf8700', width: 16, height: 16 },
              zIndex: 50,
            });
          }
        });
      });
    });
  });

  model.relations.forEach((rel) => {
    const s = rootIds[rel.from], t = rootIds[rel.to];
    if (s && t) g.setEdge(s, t);
  });

  Dagre.layout(g);
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  // ========== 孤立 ctx 处理 ==========
  // 完全无 relations 连入连出的 ctx（典型场景：刚创建战略层、还没有任何跨 ctx 集成）
  // 不让 Dagre 把它们随机塞到已布局节点之间（视觉上会"挤进"别的 ctx 框）
  // 改为：检测出后放到画布右侧固定栏，独立成列
  const ctxConnected = new Set();
  model.relations.forEach((rel) => {
    if (rootIds[rel.from]) ctxConnected.add(rel.from);
    if (rootIds[rel.to]) ctxConnected.add(rel.to);
  });
  const isolatedCtxIds = model.contexts
    .filter(c => !ctxConnected.has(c.id) && (allRootIdsByCtx[c.id] || []).length > 0)
    .map(c => c.id);
  // 是否所有 ctx 都孤立？是的话不需要"右侧栏"，按默认 Dagre 横向排即可
  const hasConnectedCtx = model.contexts.some(c => ctxConnected.has(c.id));
  if (hasConnectedCtx && isolatedCtxIds.length > 0) {
    // 找到已布局的最右 X
    let maxRight = -Infinity;
    g.nodes().forEach((id) => {
      if (isolatedCtxIds.some(cid => id.startsWith(`${cid}__`))) return;
      const dn = g.node(id);
      const right = dn.x + dn.width / 2;
      if (right > maxRight) maxRight = right;
    });
    // 孤立 ctx 沿 Y 轴竖向排在右侧
    const ISOLATED_GAP_X = 200;
    const ISOLATED_GAP_Y = 80;
    let cursorY = 0;
    isolatedCtxIds.forEach((cid) => {
      const ids = allRootIdsByCtx[cid] || [];
      ids.forEach((id) => {
        const dn = g.node(id);
        if (!dn) return;
        // 强制覆盖 Dagre 的位置：放在最右侧，按 Y 累加
        dn.x = maxRight + ISOLATED_GAP_X + dn.width / 2;
        dn.y = cursorY + dn.height / 2;
        cursorY += dn.height + ISOLATED_GAP_Y;
      });
    });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  g.nodes().forEach((id) => {
    const dn = g.node(id);
    if (!nodeMap[id]) return;
    const cW = dn.width;
    const clusterLeft = dn.x - cW / 2;
    const clusterTop = dn.y - dn.height / 2;

    nodeMap[id].position = {
      x: clusterLeft + cW / 2 - ROOT_W / 2,
      y: clusterTop,
    };

    // service 节点没有 children，跳过 child 展开
    const children = childrenMap[id] || [];
    if (children.length > 0) {
      const totalChildW = children.length * CHILD_W + (children.length - 1) * CHILD_GAP_X;
      const childStartX = clusterLeft + cW / 2 - totalChildW / 2;
      children.forEach((cid, i) => {
        nodeMap[cid].position = {
          x: childStartX + i * (CHILD_W + CHILD_GAP_X),
          y: clusterTop + CHILD_OFFSET_Y,
        };
      });
    }
  });

  // Context background + 收集全局边界（多聚合时圈住所有聚合 + 服务）
  const ctxBgSize = {}; // ctx_id -> {x, y, w, h}（供 handle 选择算法用）
  model.contexts.forEach((ctx) => {
    const ctxRootIds = allRootIdsByCtx[ctx.id] || [];
    const ctxSvcIds = serviceIdsByCtx[ctx.id] || [];
    if (ctxRootIds.length === 0 && ctxSvcIds.length === 0) return;
    // 收集该 ctx 的所有节点 id：所有 root + 它们各自的 children + 所有 service
    const memberIds = [];
    ctxRootIds.forEach(rid => {
      memberIds.push(rid);
      (childrenMap[rid] || []).forEach(cid => memberIds.push(cid));
    });
    ctxSvcIds.forEach(sid => memberIds.push(sid));
    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    memberIds.forEach((mid) => {
      const pos = nodeMap[mid]?.position;
      if (!pos) return;
      const isRoot = ctxRootIds.includes(mid);
      const isSvc = ctxSvcIds.includes(mid);
      const w = (isRoot || isSvc) ? ROOT_W : CHILD_W;
      const h = isRoot ? ROOT_H : (isSvc ? ROOT_H + 40 : CHILD_H);
      cMinX = Math.min(cMinX, pos.x);
      cMinY = Math.min(cMinY, pos.y);
      cMaxX = Math.max(cMaxX, pos.x + w);
      cMaxY = Math.max(cMaxY, pos.y + h);
    });
    const bgX = cMinX - CTX_PAD;
    const bgY = cMinY - CTX_PAD - CTX_HDR;
    const bgW = cMaxX - cMinX + CTX_PAD * 2;
    const bgH = cMaxY - cMinY + CTX_PAD * 2 + CTX_HDR;
    minX = Math.min(minX, bgX);
    minY = Math.min(minY, bgY);
    maxX = Math.max(maxX, bgX + bgW);
    maxY = Math.max(maxY, bgY + bgH);
    ctxBgSize[ctx.id] = { x: bgX, y: bgY, w: bgW, h: bgH };
    nodes.unshift({
      id: `ctx-bg-${ctx.id}`,
      type: 'contextBg',
      position: { x: bgX, y: bgY },
      style: { zIndex: -1 },
      data: {
        ctx: {
          name: ctx.name, id: ctx.id, type: ctx.type,
          type_rationale: ctx.type_rationale, responsibility: ctx.responsibility,
          ubiquitous_language: ctx.ubiquitous_language,
        },
        width: bgW, height: bgH,
        highlighted: isHL(`ctx-bg-${ctx.id}`),
        pendingChange: getPending(`ctx-bg-${ctx.id}`),
        onShowCtxDetail,
      },
    });
  });

  // 事件边（ctx-level）：按 (from, to) 聚合 —— 多事件叠加到 1 条边上
  // 这是 generic 处理：不关心 ctx 类型/事件含义，只看图结构
  // 每对 ctx 之间最多 1 条边 → 不会出现 N 条平行线 label 撞在一起
  const edgeGroups = new Map();   // key = `${from}->${to}` -> [rel, ...]
  model.relations.forEach((rel) => {
    if (!ctxBgSize[rel.from] || !ctxBgSize[rel.to]) return;
    const k = `${rel.from}->${rel.to}`;
    if (!edgeGroups.has(k)) edgeGroups.set(k, []);
    edgeGroups.get(k).push(rel);
  });
  edgeGroups.forEach((rels, key) => {
    const [from, to] = key.split('->');
    const sBg = `ctx-bg-${from}`, tBg = `ctx-bg-${to}`;
    edges.push({
      id: `event-${key}`, source: sBg, target: tBg,
      type: 'event',
      data: {
        // 兼容字段：首个事件平铺到顶层（老的 EventEdge 渲染路径）
        event: rels[0].event, label: rels[0].label,
        relationType: rels[0].relation_type, integration: rels[0].integration,
        dataFlow: rels[0].data_flow, failureStrategy: rels[0].failure_strategy,
        // 新字段：events 数组（EventEdge 检测到后会展示数量徽章 + hover 列表）
        events: rels.map(r => ({
          event: r.event, label: r.label,
          relationType: r.relation_type, integration: r.integration,
          dataFlow: r.data_flow, failureStrategy: r.failure_strategy,
        })),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8c959f' },
    });
  });

  // ========== 通用 post-layout handle 自动选择 ==========
  // 规则按信号强度分层：
  //   1) 结构性父子（root → 它的 entity/VO）：忠于布局约定，永远走垂直（root 在上、child 在下）
  //      —— Y 轴是布局公理（CHILD_OFFSET_Y），X 轴只是兄弟展开，几何最短不能凌驾结构语义
  //   2) 自由节点（svc↔root、ctx-bg↔ctx-bg 事件等）：按节点中心点的 dx/dy 主导方向选最近 handle
  const allRootIds = new Set(Object.values(allRootIdsByCtx).flat());
  const allSvcIds = new Set(Object.values(serviceIdsByCtx).flat());
  const getNodeSize = (nodeId) => {
    if (nodeId.startsWith('ctx-bg-')) {
      const ctxId = nodeId.replace('ctx-bg-', '');
      const sz = ctxBgSize[ctxId];
      if (sz) return { w: sz.w, h: sz.h };
    }
    if (allRootIds.has(nodeId)) return { w: ROOT_W, h: ROOT_H };
    if (allSvcIds.has(nodeId)) return { w: ROOT_W, h: ROOT_H + 40 };
    return { w: CHILD_W, h: CHILD_H };
  };
  const isStructuralChild = (s, t) => (childrenMap[s] || []).includes(t);
  edges.forEach((e) => {
    // 优先级 1：结构性父子边
    if (isStructuralChild(e.source, e.target)) {
      e.sourceHandle = 'bottom';
      e.targetHandle = 'top';
      return;
    }
    // 优先级 2：几何最短
    // ctx-bg 节点不在 nodeMap 中（unshift 时机晚于 nodeMap 构建），从 ctxBgSize 取位置
    const getPos = (id) => {
      if (id.startsWith('ctx-bg-')) {
        const sz = ctxBgSize[id.replace('ctx-bg-', '')];
        return sz ? { x: sz.x, y: sz.y } : null;
      }
      return nodeMap[id]?.position || null;
    };
    const sPos = getPos(e.source);
    const tPos = getPos(e.target);
    if (!sPos || !tPos) return;
    const ss = getNodeSize(e.source);
    const ts = getNodeSize(e.target);
    const sCx = sPos.x + ss.w / 2;
    const sCy = sPos.y + ss.h / 2;
    const tCx = tPos.x + ts.w / 2;
    const tCy = tPos.y + ts.h / 2;
    const dx = tCx - sCx;
    const dy = tCy - sCy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) { e.sourceHandle = 'right'; e.targetHandle = 'left'; }
      else        { e.sourceHandle = 'left-out'; e.targetHandle = 'right-in'; }
    } else {
      if (dy > 0) { e.sourceHandle = 'bottom'; e.targetHandle = 'top'; }
      else        { e.sourceHandle = 'top-out'; e.targetHandle = 'bottom-in'; }
    }
  });

  // ========== ctx-bg 真正 parent 化（让 ctx 整体拖动）==========
  // 把 ctx 内部节点位置从 absolute 转为 relative，并设置 parentNode / extent=parent。
  // React Flow 语义：parent 拖动时 children 自动跟随；children 限制在 parent 边界内。
  // 必须在 handle selection 之后做，因为 handle 选择基于 absolute 几何关系。
  Object.entries(allRootIdsByCtx).forEach(([ctxId, rootIdList]) => {
    const sz = ctxBgSize[ctxId];
    if (!sz) return;
    const parentId = `ctx-bg-${ctxId}`;
    const memberIds = [];
    rootIdList.forEach(rid => {
      memberIds.push(rid);
      (childrenMap[rid] || []).forEach(cid => memberIds.push(cid));
    });
    (serviceIdsByCtx[ctxId] || []).forEach(sid => memberIds.push(sid));
    memberIds.forEach((mid) => {
      const n = nodeMap[mid];
      if (!n) return;
      n.position = { x: n.position.x - sz.x, y: n.position.y - sz.y };
      n.parentId = parentId;  // @xyflow/react v12 字段名（v10 用的是 parentNode）
      n.extent = 'parent';
      n.draggable = true;  // 允许在 parent 内拖动子节点
    });
  });
  // ctx-bg 节点本身：需要 style.width / style.height 让 React Flow 知道 parent 边界
  // 而且要 draggable=true 让用户能拖整个 ctx
  nodes.forEach((n) => {
    if (!n.id.startsWith('ctx-bg-')) return;
    const sz = ctxBgSize[n.id.replace('ctx-bg-', '')];
    if (!sz) return;
    n.style = { ...(n.style || {}), width: sz.w, height: sz.h, zIndex: -1 };
    n.draggable = true;
  });

  return { nodes, edges };
}

export default function DomainView({ model, onShowDetail, onShowCtxDetail, onJumpToArch, highlightIds, pendingMap }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!model) return;
    const { nodes: n, edges: e } = buildLayout(model, { onShowDetail, onJumpToArch, onShowCtxDetail }, highlightIds, pendingMap);
    setNodes(n);
    setEdges(e);
  }, [model, onShowDetail, onShowCtxDetail, onJumpToArch, highlightIds, pendingMap]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#d1d9e0" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          const t = n.data?.memberType;
          if (t === 'root') return '#0969da';
          if (t === 'entity') return '#1a7f37';
          if (t === 'vo') return '#8250df';
          if (t === 'service') return '#bf8700';
          if (t === 'empty') return '#8c959f';
          return '#d1d9e0';
        }}
        style={{ background: '#f6f8fa', border: '1px solid #d1d9e0' }}
      />
    </ReactFlow>
  );
}
