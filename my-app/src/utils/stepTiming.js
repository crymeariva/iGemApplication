/** Inter-step wait timing (hours / minutes / seconds → ms). */

export const DEFAULT_STEP_WAIT = {
  delayHours: 0,
  delayMinutes: 0,
  delaySeconds: 0,
};

export function stepWaitMs(data = {}) {
  const h = Math.max(0, Number(data.delayHours) || 0);
  const m = Math.max(0, Number(data.delayMinutes) || 0);
  const s = Math.max(0, Number(data.delaySeconds) || 0);
  return (h * 3600 + m * 60 + s) * 1000;
}

export function formatStepWait(data = {}) {
  const h = Math.max(0, Number(data.delayHours) || 0);
  const m = Math.max(0, Number(data.delayMinutes) || 0);
  const s = Math.max(0, Number(data.delaySeconds) || 0);
  if (h === 0 && m === 0 && s === 0) return null;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/** Remaining ms → compact "1h 2m 3s" / "45s" for live countdown. */
export function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Sleep in chunks so Abort can interrupt long waits.
 * onTick(remainingMs) fires about once per second.
 */
export async function abortableSleep(ms, cancelRef, onTick, chunkMs = 250) {
  const end = Date.now() + Math.max(0, ms);
  let lastShownSec = -1;

  while (Date.now() < end) {
    if (cancelRef?.current) return;

    const remaining = end - Date.now();
    const shownSec = Math.max(0, Math.ceil(remaining / 1000));
    if (shownSec !== lastShownSec) {
      lastShownSec = shownSec;
      if (typeof onTick === 'function') onTick(remaining);
    }

    await new Promise((r) => setTimeout(r, Math.min(chunkMs, remaining)));
  }

  if (typeof onTick === 'function') onTick(0);
}
