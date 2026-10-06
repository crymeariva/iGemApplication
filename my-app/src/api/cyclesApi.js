/**
 * API stuff for cycles
 */
import { API_BASE } from './config';

async function parseJsonSafe(res) {
  return await res.json().catch(() => null);
}

export async function listCycles() {
  const res = await fetch(`${API_BASE}/cycles`);
  if (!res.ok) return { ok: false, status: res.status, data: await parseJsonSafe(res) };
  const data = await parseJsonSafe(res);
  return { ok: true, status: res.status, data: Array.isArray(data) ? data : [] };
}

export async function getCycle(cycleId) {
  const res = await fetch(`${API_BASE}/cycles/${cycleId}`);
  if (!res.ok) return { ok: false, status: res.status, data: await parseJsonSafe(res) };
  const data = await parseJsonSafe(res);
  return { ok: true, status: res.status, data };
}

export async function createCycle({ name, nodes, edges }) {
  const res = await fetch(`${API_BASE}/cycles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, nodes, edges }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: res.status, data };
}

export async function updateCycle(cycleId, { nodes, edges }) {
  const res = await fetch(`${API_BASE}/cycles/${cycleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: res.status, data };
}

export async function deleteCycle(cycleId) {
  const res = await fetch(`${API_BASE}/cycles/${cycleId}`, {
    method: 'DELETE',
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: res.status, data };
}
