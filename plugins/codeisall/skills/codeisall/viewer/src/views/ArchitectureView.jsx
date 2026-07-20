import React, { useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
} from '@xyflow/react';
import ArchCellNode from '../nodes/ArchCellNode';
import ArchColumnHeader from '../nodes/ArchColumnHeader';
import ArchLayerBand from '../nodes/ArchLayerBand';
import ArchEventBusNode from '../nodes/ArchEventBusNode';
import SharedInfraNode from '../nodes/SharedInfraNode';

const nodeTypes = {
  archCell: ArchCellNode,
  archCol: ArchColumnHeader,
  archLayerBand: ArchLayerBand,
  archEventBus: ArchEventBusNode,
  sharedInfra: SharedInfraNode,
};

const LAYERS = [
  { key: 'interface',      icon: '📡', title: 'Interface',      color: 'blue' },
  { key: 'application',    icon: '⚙',  title: 'Application',    color: 'green' },
  { key: 'domain',         icon: '💎', title: 'Domain',         color: 'purple' },
  { key: 'infrastructure', icon: '🔧', title: 'Infrastructure', color: 'gray' },
];

const CELL_W = 280;
const COL_GAP = 80;
const ROW_GAP = 36;
const HEADER_H = 60;
const HEADER_GAP = 24;
const LEFT_PAD = 200;          // 给左侧层标签留位置
const CHIP_H = 38;             // 每个 chip 大约高度
const CELL_HDR_H = 56;
const CELL_PAD_Y = 16;
const CELL_MIN_H = 110;

function deriveChips(ctx, model, layerKey) {
  // 多聚合：合并所有 aggregates 的成员
  const allAggs = (ctx.aggregates || []).filter(a => a.root && typeof a.root === 'object');
  const primaryAgg = allAggs[0];
  const primaryRoot = primaryAgg?.root || null;
  // 把多聚合的 entities/VOs/services 合并展示（每个 chip 标注属于哪个聚合）
  const allEntities = allAggs.flatMap(a => (a.entities || []).filter(e => typeof e === 'object').map(e => ({ ...e, _aggName: a.root.name })));
  const allVOs = allAggs.flatMap(a => (a.value_objects || []).filter(v => typeof v === 'object').map(v => ({ ...v, _aggName: a.root.name })));
  const allServices = allAggs.flatMap(a => (a.domain_services || []).map(s => ({ ...s, _aggName: a.root.name })));
  const allRoots = allAggs.map(a => a.root);
  const allMethods = allAggs.flatMap(a => (a.methods || []).map(m => ({ ...m, _aggName: a.root.name })));
  const rootFile = primaryRoot ? `${ctx.id}_ctx/domain/${primaryRoot.name.toLowerCase()}.py` : null;

  if (layerKey === 'interface') {
    const eventsOut = [...new Set(
      model.relations.filter(r => r.from === ctx.id).map(r => r.event)
    )];
    const chips = [
      { name: 'Router', type: 'iface', desc: 'HTTP 入口', file: `${ctx.id}_ctx/api/router.py` },
    ];
    // 对外事件 → 跳到聚合根（事件就是从那里发的）
    eventsOut.forEach(ev => chips.push({
      name: ev, type: 'event', tag: 'event', desc: `对外发布 ${ev}`, file: rootFile,
    }));
    return chips;
  }
  if (layerKey === 'application') {
    // command 跳到聚合根所在文件（命令实际定义在 domain）
    const commands = allMethods.map(m => ({
      name: m.name.replace(/\(.*\)/, '') + '()',
      type: 'command',
      tag: 'cmd',
      desc: `${m._aggName}: ${m.precondition || ''}`,
      file: `${ctx.id}_ctx/domain/${m._aggName.toLowerCase()}.py`,
    }));
    const eventsIn = model.relations.filter(r => r.to === ctx.id);
    const handlers = eventsIn.map(r => ({
      name: `on_${r.event}`,
      type: 'handler',
      tag: 'handler',
      desc: `监听 ${r.event}（来自 ${r.from}）`,
      sourceContext: r.from,
      sourceEvent: r.event,
      file: `${ctx.id}_ctx/application/handlers/on_${r.event.toLowerCase()}.py`,
    }));
    // CQRS 查询侧 —— application/queries/
    const queries = (ctx.query_handlers || []).map(q => ({
      name: q.name + '()',
      type: 'query',
      tag: 'query',
      desc: q.visibility ? `🔒 ${q.visibility.slice(0, 40)}${q.visibility.length > 40 ? '...' : ''}` : `→ ${q.returns}`,
      file: q.source_location?.file || `${ctx.id}_ctx/application/queries/${q.name}.py`,
    }));
    return [...commands, ...handlers, ...queries];
  }
  if (layerKey === 'domain') {
    const chips = [];
    // 多聚合：每个 root 一个 chip + 跟随其 entities/vos/services
    allRoots.forEach((r) => {
      chips.push({
        name: r.name, type: 'root', tag: 'root',
        desc: `${ctx.id}.${r.name} 聚合根`,
        file: `${ctx.id}_ctx/domain/${r.name.toLowerCase()}.py`,
      });
    });
    allEntities.forEach(e => chips.push({
      name: e.name, type: 'entity', tag: 'entity',
      desc: `${e._aggName} 的实体`,
      file: `${ctx.id}_ctx/domain/${e.name.toLowerCase()}.py`,
    }));
    allVOs.forEach(v => chips.push({
      name: v.name, type: 'vo', tag: 'vo',
      desc: `${v._aggName} 的 VO`,
      file: `${ctx.id}_ctx/domain/value_objects.py`,
    }));
    allServices.forEach(svc => chips.push({
      name: svc.name, type: 'service', tag: 'service',
      desc: svc.description || `跨 ${(svc.operates_on || []).join(', ')}`,
      file: `${ctx.id}_ctx/domain/services/${svc.name.replace(/Service$/, '').toLowerCase()}_service.py`,
    }));
    return chips;
  }
  if (layerKey === 'infrastructure') {
    // 多聚合：每个聚合根一个 Repository
    const chips = [];
    allRoots.forEach(r => chips.push({
      name: `${r.name}Repository`, type: 'infra', tag: 'repo',
      desc: `${r.name} 持久化适配`, uses: ['mysql'],
      file: `${ctx.id}_ctx/infra/repository.py`,
    }));
    chips.push({ name: 'EventPublisher', type: 'infra', tag: 'pub', desc: '事件发布', uses: ['event_bus'], file: `${ctx.id}_ctx/infra/publisher.py` });
    // CQRS 读模型 —— 每个 @view_model 一个 chip
    (ctx.view_models || []).forEach(vm => chips.push({
      name: vm.name,
      type: 'readmodel',
      tag: 'readmodel',
      desc: `读模型：${vm.source || ''}`,
      file: vm.source_location?.file || `${ctx.id}_ctx/application/views/${vm.name.toLowerCase()}.py`,
    }));
    const aclSources = model.relations
      .filter(r => r.to === ctx.id && r.relation_type === 'anticorruption-layer')
      .map(r => r.from);
    aclSources.forEach(src => chips.push({
      name: `${src}_ACL`, type: 'acl', tag: 'acl', desc: `防腐层：翻译 ${src} 域概念`,
      file: `${ctx.id}_ctx/infra/acl/${src}_acl.py`,
    }));
    if (ctx.id === 'payment') {
      chips.push({ name: 'WechatPayGateway', type: 'infra', tag: 'gw', desc: '微信支付适配', file: `${ctx.id}_ctx/infra/gateway/wechat_pay.py` });
      chips.push({ name: 'AlipayGateway', type: 'infra', tag: 'gw', desc: '支付宝适配', file: `${ctx.id}_ctx/infra/gateway/alipay.py` });
    }
    return chips;
  }
  return [];
}

function cellHeight(chipCount) {
  return Math.max(CELL_MIN_H, CELL_HDR_H + CELL_PAD_Y + chipCount * CHIP_H);
}

function buildLayout(model, focus, onJumpToCode) {
  const nodes = [];
  const edges = [];
  const contexts = model.contexts;

  // ---------- 1. 计算每个 (ctx, layer) 的 chip 列表 + 每层最大高度 ----------
  const cellChips = {};        // [layerKey][ctxId] = chips
  const layerHeights = {};     // [layerKey] = max cell height in that row

  LAYERS.forEach((layer) => {
    cellChips[layer.key] = {};
    let maxH = CELL_MIN_H;
    contexts.forEach((ctx) => {
      const chips = deriveChips(ctx, model, layer.key);
      cellChips[layer.key][ctx.id] = chips;
      maxH = Math.max(maxH, cellHeight(chips.length));
    });
    layerHeights[layer.key] = maxH;
  });

  // ---------- 2. 列 X 坐标 + 总宽 ----------
  const colXs = contexts.map((_, i) => LEFT_PAD + i * (CELL_W + COL_GAP));
  const totalW = LEFT_PAD + contexts.length * CELL_W + (contexts.length - 1) * COL_GAP + 60;

  // ---------- 3. 计算每层 Y 坐标 ----------
  const rowYs = {};
  let yCursor = HEADER_H + HEADER_GAP;
  LAYERS.forEach((layer) => {
    rowYs[layer.key] = yCursor;
    yCursor += layerHeights[layer.key] + ROW_GAP;
  });
  const layerBottomY = yCursor; // Infrastructure 底部 + ROW_GAP

  // ---------- 4. 节点：列头（context）----------
  contexts.forEach((ctx, ci) => {
    nodes.push({
      id: `col-${ctx.id}`,
      type: 'archCol',
      position: { x: colXs[ci], y: 0 },
      draggable: false,
      selectable: false,
      data: { ctx },
      style: { width: CELL_W },
    });
  });

  // ---------- 5. 节点：横向层带（背景）----------
  LAYERS.forEach((layer) => {
    nodes.push({
      id: `band-${layer.key}`,
      type: 'archLayerBand',
      position: { x: 0, y: rowYs[layer.key] - 6 },
      draggable: false,
      selectable: false,
      zIndex: -10,
      data: { color: layer.color, width: totalW, height: layerHeights[layer.key] + 12 },
    });
  });

  // ---------- 6. 节点：cells ----------
  contexts.forEach((ctx, ci) => {
    LAYERS.forEach((layer) => {
      const chips = cellChips[layer.key][ctx.id];
      const cellId = `cell-${ctx.id}-${layer.key}`;
      const isFocused = focus?.contextId === ctx.id && chips.some(c => c.name === focus.member);
      // cell 高度：贴齐当前层的 max height（视觉对齐）
      const h = layerHeights[layer.key];
      nodes.push({
        id: cellId,
        type: 'archCell',
        position: { x: colXs[ci], y: rowYs[layer.key] },
        draggable: false,
        zIndex: 10,
        data: {
          layer,
          chips,
          focusChip: focus?.member,
          onClickChip: (chip) => onJumpToCode && chip.file && onJumpToCode(ctx.id, chip.file),
        },
        style: { width: CELL_W, minHeight: h, border: isFocused ? '3px solid #d1242f' : undefined },
      });
    });
  });

  // ---------- 7. 节点：EventBus（中央总线）----------
  const eventBusY = layerBottomY + 20;
  // 把 model.events 跟 relations 整合成 EventBus 列表
  const eventList = (model.events || []).map(ev => ({
    name: ev.name,
    trigger: ev.trigger,
    consumers: (ev.consumers || []),
  }));
  // 加上仅出现在 relations 但不在 events[] 的事件（兜底）
  const eventNamesInList = new Set(eventList.map(e => e.name));
  (model.relations || []).forEach(r => {
    if (!eventNamesInList.has(r.event)) {
      eventList.push({
        name: r.event, trigger: '', consumers: [{ context: r.to, aggregate: '', method: r.label || '' }],
      });
      eventNamesInList.add(r.event);
    }
  });

  const eventBusNodeId = 'event-bus';
  nodes.push({
    id: eventBusNodeId,
    type: 'archEventBus',
    position: { x: LEFT_PAD, y: eventBusY },
    draggable: false,
    selectable: false,
    data: { events: eventList, width: totalW - LEFT_PAD - 20 },
  });

  // ---------- 8. 连线：跨 Context 事件流 ----------
  // 现在路径是：上游 Infrastructure cell → EventBus（一条线）
  // 不再画到下游 Application（消费方在 EventBus 文本里已经列出）
  const seenInfraToBus = new Set();
  (model.relations || []).forEach((rel, i) => {
    const sourceId = `cell-${rel.from}-infrastructure`;
    if (seenInfraToBus.has(rel.from)) return; // 同一个上游 Context 只画一根线到 Bus
    seenInfraToBus.add(rel.from);
    edges.push({
      id: `pub-${rel.from}`,
      source: sourceId, sourceHandle: 'bottom-out',
      target: eventBusNodeId, targetHandle: 'top',
      style: { stroke: '#1a7f37', strokeWidth: 2, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1a7f37' },
      label: 'publish',
      labelStyle: { fontSize: 10, fill: '#1a7f37', fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
      labelBgPadding: [3, 2],
    });
  });

  // ---------- 9. 节点：Shared 底栏 + Infra → shared 连线 ----------
  const sharedY = eventBusY + 56 + Math.max(160, eventList.length * 38);
  const sharedNodeId = 'shared-infra';
  nodes.push({
    id: sharedNodeId,
    type: 'sharedInfra',
    position: { x: LEFT_PAD, y: sharedY },
    draggable: false,
    selectable: false,
    data: { items: model.shared_infrastructure || [], width: totalW - LEFT_PAD - 20 },
  });

  // 一条粗线：EventBus → Shared（表达 "EventBus 实现来自 shared/event_bus.py"）
  edges.push({
    id: 'bus-uses-shared',
    source: eventBusNodeId, sourceHandle: 'bottom',
    target: sharedNodeId, targetHandle: 'top',
    style: { stroke: '#8c959f', strokeWidth: 1, strokeDasharray: '3 3' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8c959f', width: 8, height: 8 },
    label: 'realized by',
    labelStyle: { fontSize: 9, fill: '#8c959f' },
  });

  return { nodes, edges };
}

export default function ArchitectureView({ model, focus, onJumpToCode }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!model) return;
    const { nodes: n, edges: e } = buildLayout(model, focus, onJumpToCode);
    setNodes(n);
    setEdges(e);
  }, [model, focus, onJumpToCode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#d1d9e0" gap={20} />
      <Controls />
      <MiniMap style={{ background: '#f6f8fa', border: '1px solid #d1d9e0' }} />
    </ReactFlow>
  );
}
