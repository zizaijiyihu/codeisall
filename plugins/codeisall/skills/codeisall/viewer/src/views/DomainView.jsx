import React, { useEffect, useRef, useCallback } from 'react';
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

// 宽度由 CSS 固定（.member-node width:300, type-root/service 320），可信，不测量。
// 高度才是变量 —— 由内容撑开，改用 React Flow 测量值喂 dagre，不再写死。
const ROOT_W = 320;
const CHILD_W = 300;
const CHILD_GAP_X = 60;
// child 相对 root 的最小垂直间距（不再假设 root 高度；偏移 = 真实 rootH + 此间距）
const CHILD_OFFSET_Y_MIN = 40;
const CTX_PAD = 40;
const CTX_HDR = 60;

// 首帧 fallback 估算高度（节点挂载前 dagre 用，测量回来后替换为真实值）
const FB_ROOT_H = 150;
const FB_CHILD_H = 120;
const FB_SVC_H = 160;

function buildLayout(model, callbacks, highlightIds, pendingMap, measured) {
  const { onShowDetail, onJumpToArch, onShowCtxDetail } = callbacks;
  const isHL = (id) => highlightIds && highlightIds.has(id);
  const getPending = (id) => (pendingMap && pendingMap.get(id)) || null;

  // 取节点真实测量尺寸，没有则用 fallback
  const getMeasured = (id, fbW, fbH) => {
    const m = measured && measured.get(id);
    return {
      w: (m && m.width) || fbW,
      h: (m && m.height) || fbH,
    };
  };

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
    if (aggregates.length === 0) {
      const placeholderId = `${ctx.id}__empty_placeholder`;
      allRootIdsByCtx[ctx.id].push(placeholderId);
      const { h } = getMeasured(placeholderId, ROOT_W, FB_ROOT_H);
      g.setNode(placeholderId, { width: ROOT_W, height: h });
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
      if (aggIdx === 0) rootIds[ctx.id] = rootId;

      const entities = (agg.entities || []).filter(e => typeof e === 'object');
      const vos = (agg.value_objects || []).filter(v => typeof v === 'object');
      const childCount = entities.length + vos.length;
      const rootSize = getMeasured(rootId, ROOT_W, FB_ROOT_H);
      const clusterW = childCount > 0
        ? Math.max(rootSize.w, childCount * CHILD_W + (childCount - 1) * CHILD_GAP_X)
        : rootSize.w;
      // cluster 是 dagre 的占位大盒子：root 自身 + 其下所有 child 的总高
      // child 偏移 = rootH + CHILD_OFFSET_Y_MIN，children 各自高度用 fallback（测量后整体重排修正）
      const clusterH = childCount > 0
        ? rootSize.h + CHILD_OFFSET_Y_MIN + FB_CHILD_H
        : rootSize.h;
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
        const svcSize = getMeasured(svcId, ROOT_W, FB_SVC_H);
        g.setNode(svcId, { width: svcSize.w, height: svcSize.h });
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
  const ctxConnected = new Set();
  model.relations.forEach((rel) => {
    if (rootIds[rel.from]) ctxConnected.add(rel.from);
    if (rootIds[rel.to]) ctxConnected.add(rel.to);
  });
  const isolatedCtxIds = model.contexts
    .filter(c => !ctxConnected.has(c.id) && (allRootIdsByCtx[c.id] || []).length > 0)
    .map(c => c.id);
  const hasConnectedCtx = model.contexts.some(c => ctxConnected.has(c.id));
  if (hasConnectedCtx && isolatedCtxIds.length > 0) {
    let maxRight = -Infinity;
    g.nodes().forEach((id) => {
      if (isolatedCtxIds.some(cid => id.startsWith(`${cid}__`))) return;
      const dn = g.node(id);
      const right = dn.x + dn.width / 2;
      if (right > maxRight) maxRight = right;
    });
    const ISOLATED_GAP_X = 200;
    const ISOLATED_GAP_Y = 80;
    let cursorY = 0;
    isolatedCtxIds.forEach((cid) => {
      const ids = allRootIdsByCtx[cid] || [];
      ids.forEach((id) => {
        const dn = g.node(id);
        if (!dn) return;
        dn.x = maxRight + ISOLATED_GAP_X + dn.width / 2;
        dn.y = cursorY + dn.height / 2;
        cursorY += dn.height + ISOLATED_GAP_Y;
      });
    });
  }

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

    const children = childrenMap[id] || [];
    if (children.length > 0) {
      // child 偏移 = 真实 root 高度 + 最小间距（修复旧 bug：写死 200 假设 root 占 110 → root 盖住 child）
      const rootSize = getMeasured(id, ROOT_W, FB_ROOT_H);
      const childOffsetY = rootSize.h + CHILD_OFFSET_Y_MIN;
      const totalChildW = children.length * CHILD_W + (children.length - 1) * CHILD_GAP_X;
      const childStartX = clusterLeft + cW / 2 - totalChildW / 2;
      children.forEach((cid, i) => {
        nodeMap[cid].position = {
          x: childStartX + i * (CHILD_W + CHILD_GAP_X),
          y: clusterTop + childOffsetY,
        };
      });
    }
  });

  // Context background + 收集全局边界（用真实测量尺寸算包围盒，ctx-bg 才能包住真实 children）
  const ctxBgSize = {};
  model.contexts.forEach((ctx) => {
    const ctxRootIds = allRootIdsByCtx[ctx.id] || [];
    const ctxSvcIds = serviceIdsByCtx[ctx.id] || [];
    if (ctxRootIds.length === 0 && ctxSvcIds.length === 0) return;
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
      // root/service 用测量尺寸，child 用测量尺寸；空 placeholder 用 ROOT_W/FB_ROOT_H
      const sz = isRoot && mid.endsWith('__empty_placeholder')
        ? { w: ROOT_W, h: FB_ROOT_H }
        : getMeasured(mid, isRoot || isSvc ? ROOT_W : CHILD_W, isSvc ? FB_SVC_H : FB_CHILD_H);
      cMinX = Math.min(cMinX, pos.x);
      cMinY = Math.min(cMinY, pos.y);
      cMaxX = Math.max(cMaxX, pos.x + sz.w);
      cMaxY = Math.max(cMaxY, pos.y + sz.h);
    });
    const bgX = cMinX - CTX_PAD;
    const bgY = cMinY - CTX_PAD - CTX_HDR;
    const bgW = cMaxX - cMinX + CTX_PAD * 2;
    const bgH = cMaxY - cMinY + CTX_PAD * 2 + CTX_HDR;
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

  // 事件边（ctx-level）：按"ctx 对"双向聚合 —— 同一对 ctx 之间所有事件（含双向）合并到 1 条边，
  // 避免双向事件各自画一条贝塞尔曲线、label 叠在中点（order↔payment 的 OrderPlaced/PaymentConfirmed 曾因此重叠）。
  // key 用两个 ctx id 排序后的无向对，source/target 取该对里首个出现事件的 from→to 方向。
  const edgeGroups = new Map();
  model.relations.forEach((rel) => {
    if (!ctxBgSize[rel.from] || !ctxBgSize[rel.to]) return;
    const pair = [rel.from, rel.to].sort().join('--');
    if (!edgeGroups.has(pair)) edgeGroups.set(pair, []);
    edgeGroups.get(pair).push(rel);
  });
  edgeGroups.forEach((rels, pair) => {
    const [a, b] = pair.split('--');
    // source/target 取首个事件方向；该对里所有事件按各自 from→to 标方向，label 内区分
    const from = rels[0].from, to = rels[0].to;
    const sBg = `ctx-bg-${from}`, tBg = `ctx-bg-${to}`;
    edges.push({
      id: `event-${pair}`, source: sBg, target: tBg,
      type: 'event',
      data: {
        event: rels[0].event, label: rels[0].label,
        relationType: rels[0].relation_type, integration: rels[0].integration,
        dataFlow: rels[0].data_flow, failureStrategy: rels[0].failure_strategy,
        events: rels.map(r => ({
          event: r.event, label: r.label,
          direction: `${r.from}→${r.to}`,   // 该事件真实方向（同对 ctx 双向时用于 label 区分）
          relationType: r.relation_type, integration: r.integration,
          dataFlow: r.data_flow, failureStrategy: r.failure_strategy,
        })),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8c959f' },
    });
  });

  // ========== 通用 post-layout handle 自动选择 ==========
  const allRootIds = new Set(Object.values(allRootIdsByCtx).flat());
  const allSvcIds = new Set(Object.values(serviceIdsByCtx).flat());
  const getNodeSize = (nodeId) => {
    if (nodeId.startsWith('ctx-bg-')) {
      const sz = ctxBgSize[nodeId.replace('ctx-bg-', '')];
      if (sz) return { w: sz.w, h: sz.h };
    }
    // 用真实测量尺寸算中心，handle 选择才准（上下相邻走 top/bottom、左右相邻走 left/right）
    const m = measured && measured.get(nodeId);
    if (m) return { w: m.width, h: m.height };
    if (allRootIds.has(nodeId)) return { w: ROOT_W, h: FB_ROOT_H };
    if (allSvcIds.has(nodeId)) return { w: ROOT_W, h: FB_SVC_H };
    return { w: CHILD_W, h: FB_CHILD_H };
  };
  const isStructuralChild = (s, t) => (childrenMap[s] || []).includes(t);
  edges.forEach((e) => {
    if (isStructuralChild(e.source, e.target)) {
      e.sourceHandle = 'bottom';
      e.targetHandle = 'top';
      return;
    }
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

  // ========== ctx-bg 真正 parent 化 ==========
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
      n.parentId = parentId;
      n.extent = 'parent';
      n.draggable = true;
    });
  });
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

  // 记录用户手动拖过的节点位置 —— buildLayout 重跑后用它覆盖 dagre 结果
  const userPositionsRef = useRef(null);
  if (userPositionsRef.current === null) {
    try {
      const raw = localStorage.getItem('codeisall.userPositions');
      userPositionsRef.current = raw ? new Map(JSON.parse(raw)) : new Map();
    } catch { userPositionsRef.current = new Map(); }
  }
  const persistUserPositions = useCallback(() => {
    try {
      localStorage.setItem('codeisall.userPositions',
        JSON.stringify(Array.from(userPositionsRef.current.entries())));
    } catch {}
  }, []);

  // ===== 测量→重排 闭环 =====
  // measuredRef: 节点真实尺寸缓存（来自 React Flow 的 dimensions change）
  const measuredRef = useRef(new Map());
  // relayoutLockRef: 重排锁 —— 重排产生的 dimensions change 不再触发新重排（防死循环）
  const relayoutLockRef = useRef(false);
  // lastLayoutSizesRef: 上轮喂 dagre 的尺寸快照，判定是否收敛
  const lastLayoutSizesRef = useRef(new Map());
  const relayoutTimerRef = useRef(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const cbRef = useRef({ onShowDetail, onJumpToArch, onShowCtxDetail, highlightIds, pendingMap });
  cbRef.current = { onShowDetail, onJumpToArch, onShowCtxDetail, highlightIds, pendingMap };

  const doRelayout = useCallback(() => {
    // 对比本轮 measured 与上轮喂入快照，没变就收敛停止
    let changed = false;
    for (const [id, m] of measuredRef.current) {
      const last = lastLayoutSizesRef.current.get(id);
      if (!last || Math.abs(last.w - m.width) > 1 || Math.abs(last.h - m.height) > 1) {
        changed = true; break;
      }
    }
    if (!changed) return;

    relayoutLockRef.current = true;
    const { onShowDetail: osd, onJumpToArch: oja, onShowCtxDetail: osc, highlightIds: hl, pendingMap: pm } = cbRef.current;
    const { nodes: n, edges: e } = buildLayout(
      modelRef.current, { onShowDetail: osd, onJumpToArch: oja, onShowCtxDetail: osc },
      hl, pm, measuredRef.current
    );
    lastLayoutSizesRef.current = new Map(measuredRef.current);
    const merged = n.map((node) => {
      const saved = userPositionsRef.current.get(node.id);
      return saved ? { ...node, position: saved } : node;
    });
    setNodes(merged);
    setEdges(e);
    // 下一帧解锁：允许重排后产生的新 dimensions change 被处理
    requestAnimationFrame(() => { relayoutLockRef.current = false; });
  }, []);

  const scheduleRelayout = useCallback(() => {
    if (relayoutTimerRef.current) clearTimeout(relayoutTimerRef.current);
    relayoutTimerRef.current = setTimeout(() => {
      relayoutTimerRef.current = null;
      doRelayout();
    }, 80);
  }, [doRelayout]);

  // 拦截 onNodesChange：捕获 dimensions（尺寸测量回流）+ position（拖动落库）
  const handleNodesChange = useCallback((changes) => {
    let sizeChanged = false;
    changes.forEach((c) => {
      if (c.type === 'dimensions' && c.dimensions) {
        const prev = measuredRef.current.get(c.id);
        const d = c.dimensions;
        if (!prev || Math.abs(prev.width - d.width) > 0.5 || Math.abs(prev.height - d.height) > 0.5) {
          measuredRef.current.set(c.id, { width: d.width, height: d.height });
          sizeChanged = true;
        }
      }
      if (c.type === 'position' && c.dragging === false && c.position) {
        userPositionsRef.current.set(c.id, { x: c.position.x, y: c.position.y });
      }
    });
    onNodesChange(changes);
    if (changes.some(c => c.type === 'position' && c.dragging === false)) {
      persistUserPositions();
    }
    if (sizeChanged && !relayoutLockRef.current) {
      scheduleRelayout();
    }
  }, [onNodesChange, persistUserPositions, scheduleRelayout]);

  // model / callbacks / highlight / pending 变化 → 重跑 buildLayout（用已测尺寸）
  useEffect(() => {
    if (!model) return;
    const { nodes: n, edges: e } = buildLayout(
      model, { onShowDetail, onJumpToArch, onShowCtxDetail }, highlightIds, pendingMap, measuredRef.current
    );
    // model 变了，节点集合可能变 → 重置快照，让后续 dimensions 能正确判定收敛
    lastLayoutSizesRef.current = new Map(measuredRef.current);
    const merged = n.map((node) => {
      const saved = userPositionsRef.current.get(node.id);
      return saved ? { ...node, position: saved } : node;
    });
    setNodes(merged);
    setEdges(e);
  }, [model, onShowDetail, onShowCtxDetail, onJumpToArch, highlightIds, pendingMap]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.05}
      maxZoom={2}
      panOnScroll
      panOnScrollSpeed={0.8}
      zoomOnScroll={false}
      zoomOnPinch
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
