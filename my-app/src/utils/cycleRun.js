import {
  periRotationsToSteps,
  syringeMlToSteps,
} from '../pumpCalibration';

export const RUNNABLE_TYPES = new Set(['syringePump', 'peristalticPump', 'spectrometer', 'electroporator']);

/**
 * Orders the runnable nodes into a single chain by following edges.
 * Returns { ok: true, order } or { ok: false, error }.
 */
export function getNodeOrder(nodes, edges) {
  const runnable = nodes.filter((n) => RUNNABLE_TYPES.has(n.type));

  if (runnable.length === 0) {
    return { ok: false, error: 'No runnable nodes on the canvas.' };
  }

  if (runnable.length === 1) {
    return { ok: true, order: runnable };
  }

  const runnableIds = new Set(runnable.map((n) => n.id));
  const nodeById = new Map(runnable.map((n) => [n.id, n]));

  const chainEdges = edges.filter(
    (e) => runnableIds.has(e.source) && runnableIds.has(e.target)
  );

  const indegree = new Map();
  const outdegree = new Map();
  const nextBySource = new Map();

  for (const id of runnableIds) {
    indegree.set(id, 0);
    outdegree.set(id, 0);
  }

  for (const edge of chainEdges) {
    if (outdegree.get(edge.source) >= 1) {
      return {
        ok: false,
        error: 'Each node can only have one outgoing connection.',
      };
    }
    if (indegree.get(edge.target) >= 1) {
      return {
        ok: false,
        error: 'Each node can only have one incoming connection.',
      };
    }

    indegree.set(edge.target, indegree.get(edge.target) + 1);
    outdegree.set(edge.source, outdegree.get(edge.source) + 1);
    nextBySource.set(edge.source, edge.target);
  }

  const heads = runnable.filter((n) => indegree.get(n.id) === 0);

  if (heads.length !== 1) {
    return {
      ok: false,
      error:
        heads.length === 0
          ? 'Node chain has a cycle (no start node).'
          : 'Connect nodes into one chain (multiple start nodes found).',
    };
  }

  const order = [];
  const visited = new Set();
  let currentId = heads[0].id;

  while (currentId) {
    if (visited.has(currentId)) {
      return { ok: false, error: 'Node chain has a cycle.' };
    }

    visited.add(currentId);
    order.push(nodeById.get(currentId));
    currentId = nextBySource.get(currentId);
  }

  if (order.length !== runnable.length) {
    return {
      ok: false,
      error: 'All runnable nodes must be connected in one chain (floating node found).',
    };
  }

  return { ok: true, order };
}

/**
 * Checks every node's settings before a run starts.
 * Returns an error message for the first invalid node, or null if all are valid.
 */
export function validateRunNodes(order) {
  for (const node of order) {
    const settings = node.data?.settings ?? {};
    const label = node.data?.label ?? node.id;

    if (node.type === 'spectrometer') {
      if (
        !settings.port ||
        !Number.isFinite(Number(settings.target)) ||
        !Number.isFinite(Number(settings.durationSec)) ||
        Number(settings.durationSec) <= 0
      ) {
        return `Missing port, target, or duration on "${label}".`;
      }
      if (settings.timeoutMin != null && settings.timeoutMin !== '') {
        const timeoutMin = Number(settings.timeoutMin);
        if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) {
          return `Max wait on "${label}" must be a positive number of minutes, or blank for no limit.`;
        }
        if (timeoutMin * 60 <= Number(settings.durationSec)) {
          return `Max wait on "${label}" must be longer than its averaging duration.`;
        }
      }
      continue;
    }

    if (!settings.boardVal || !settings.axis || !settings.direction) {
      return `Missing board/axis/direction on "${label}".`;
    }

    if (node.type === 'syringePump' && !syringeMlToSteps(settings.volumeMl)) {
      return `Missing or invalid volume (mL) on "${label}".`;
    }

    if (node.type === 'peristalticPump' && !periRotationsToSteps(settings.rotations)) {
      return `Missing or invalid rotations on "${label}".`;
    }
  }

  return null;
}
