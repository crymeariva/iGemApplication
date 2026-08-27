const ALLOWED_TYPES = new Set([
    'peristalticPump',
    'syringePump',
    'thermometer',
    'spectrometer',
    'electroporator',
  ]);
  
  /**
   * Normalize and validate LLM cycle JSON.
   * @returns {{ ok: true, cycle } | { ok: false, error: string }}
   */
  function validateCycle(raw) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Cycle must be JSON object' };
    }
  
    const nodes = raw.nodes;
    const edges = raw.edges;

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return { ok: false, error: 'Cycle must include nodes[] and edges[]' };
    }
    if (nodes.length === 0) {
      return { ok: false, error: 'Cycle has no nodes' };
    }
  
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node || typeof node !== 'object') {
        return { ok: false, error: 'Invalid node' };
      }
      if (!ALLOWED_TYPES.has(node.type)) {
        return { ok: false, error: `Unknown node type: ${node.type}` };
      }
      if (!node.id || typeof node.id !== 'string') {
        node.id = `n${i + 1}`;
      }
    }
  
    const ids = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      if (!edge?.source || !edge?.target) {
        return { ok: false, error: 'Each edge needs source and target' };
      }
      if (!ids.has(edge.source) || !ids.has(edge.target)) {
        return { ok: false, error: 'Edge references unknown node id' };
      }
    }
  
    return {
      ok: true,
      cycle: {
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Generated cycle',
        summary: typeof raw.summary === 'string' ? raw.summary : '',
        nodes,
        edges,
      },
    };
  }
  
  module.exports = { validateCycle, ALLOWED_TYPES };