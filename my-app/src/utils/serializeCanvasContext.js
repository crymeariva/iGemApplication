const NODE_TYPE_NAMES = {
  peristalticPump: 'Peristaltic Pump',
  syringePump: 'Syringe Pump',
  thermometer: 'Thermometer',
  spectrometer: 'Spectrometer',
  electroporator: 'Electroporator',
};

function displayName(node) {
  return node.label || NODE_TYPE_NAMES[node.type] || node.type || 'Unknown node';
}

function formatSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';

  const entries = Object.entries(settings).filter(([, value]) => {
    if (value === null || value === undefined || value === '') return false;
    return true;
  });

  if (entries.length === 0) return '(none configured)';

  return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
}

function buildConnectionMaps(edges) {
  const outgoing = {};
  const incoming = {};

  for (const edge of edges) {
    outgoing[edge.source] = outgoing[edge.source] ?? [];
    outgoing[edge.source].push(edge.target);
    incoming[edge.target] = incoming[edge.target] ?? [];
    incoming[edge.target].push(edge.source);
  }

  return { outgoing, incoming };
}

export function formatCanvasSummary(canvasContext) {
  if (!canvasContext || canvasContext.nodeCount === 0) {
    return 'Canvas is empty (0 nodes, 0 connections).';
  }

  const { outgoing, incoming } = buildConnectionMaps(canvasContext.edges);
  const nodeById = Object.fromEntries(canvasContext.nodes.map((node) => [node.id, node]));

  const resolveNodeName = (id) => {
    const node = nodeById[id];
    return node ? displayName(node) : id;
  };

  const lines = [
    `Cycle: ${canvasContext.cycleName ?? '(unsaved)'}`,
    `TOTAL: ${canvasContext.nodeCount} node(s), ${canvasContext.edgeCount} connection(s).`,
    'When listing nodes, name every item below. The count must match TOTAL exactly.',
    '',
  ];

  canvasContext.nodes.forEach((node) => {
    const name = displayName(node);
    const connectsTo = (outgoing[node.id] ?? []).map(resolveNodeName);
    const connectsFrom = (incoming[node.id] ?? []).map(resolveNodeName);

    lines.push(`Node ${node.index}: ${name} (type: ${node.type}, id: ${node.id})`);
    lines.push(`  Settings: ${formatSettings(node.settings)}`);

    if (connectsFrom.length > 0) {
      lines.push(`  Receives from: ${connectsFrom.join(', ')}`);
    }
    if (connectsTo.length > 0) {
      lines.push(`  Connects to: ${connectsTo.join(', ')}`);
    }
    if (connectsFrom.length === 0 && connectsTo.length === 0) {
      lines.push('  Connections: none');
    }

    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

export function serializeCanvasContext(nodes, edges, cycleName = '') {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];

  const serializedNodes = safeNodes.map(({ id, type, data }, index) => ({
    index: index + 1,
    id,
    type,
    label: data?.label ?? null,
    displayName: displayName({ label: data?.label, type }),
    settings: data?.settings ?? {},
  }));

  const serializedEdges = safeEdges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
    id,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: targetHandle ?? null,
  }));

  const canvasContext = {
    cycleName: cycleName || null,
    nodeCount: serializedNodes.length,
    edgeCount: serializedEdges.length,
    nodes: serializedNodes,
    edges: serializedEdges,
  };

  return {
    ...canvasContext,
    summary: formatCanvasSummary(canvasContext),
  };
}
