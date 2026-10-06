import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../api/config';
import {
  periRotationsToSteps,
  syringeMlToSteps,
} from '../pumpCalibration';
import { getNodeOrder, validateRunNodes } from '../utils/cycleRun';
import {
  abortableSleep,
  formatCountdown,
  stepWaitMs,
} from '../utils/stepTiming';

function buildNodePayload(node) {
  const settings = node.data?.settings ?? {};
  const steps =
    node.type === 'peristalticPump'
      ? periRotationsToSteps(settings.rotations)
      : node.type === 'syringePump'
        ? syringeMlToSteps(settings.volumeMl)
        : Number(settings.steps);

  return {
    type: 'Motor',
    axis: settings.axis,
    board: Number(settings.boardVal),
    compInstr: {
      steps,
      Direction: settings.direction,
      Speed: settings.speed || 'S',
    },
  };
}

async function executeNode(node) {
  const settings = node.data?.settings ?? {};

  if (node.type === 'spectrometer') {
    return fetch(`${API_BASE}/spec/wait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        port: settings.port,
        metric: settings.metric || 'raw',
        target: Number(settings.target),
        durationSec: Number(settings.durationSec),
        timeoutMin: settings.timeoutMin === '' ? null : settings.timeoutMin ?? null,
      }),
    });
  }

  return fetch(`${API_BASE}/instr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildNodePayload(node)),
  });
}

export function useCycleRun({ nodes, edges, cycleCount }) {
  const cancelRunRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState(null);

  /**
   * Aborts any in-progress Send All run and halts hardware on all boards.
   */
  const onAbort = useCallback(async () => {
    cancelRunRef.current = true;
    setRunStatus((prev) => (prev ? { ...prev, aborted: true, error: null } : prev));

    // Fan out: each device family has its own stop. Add thermo/etc. here later.
    await Promise.allSettled([
      fetch(`${API_BASE}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      fetch(`${API_BASE}/spec/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    ]);
  }, []);

  /**
   * Walks the node chain and sends each instruction in order.
   * After each finished move, waits using the delay on the edge to the next node.
   * Repeats the full chain `cycleCount` times.
   */
  const onSendAll = useCallback(async () => {
    if (isRunning) return;

    const result = getNodeOrder(nodes, edges);
    if (!result.ok) {
      alert(result.error);
      return;
    }

    const validationError = validateRunNodes(result.order);
    if (validationError) {
      alert(validationError);
      return;
    }

    const totalCycles = Math.max(1, Number(cycleCount) || 1);
    const stepTotal = result.order.length;

    cancelRunRef.current = false;
    setIsRunning(true);
    setRunStatus({
      current: 0,
      total: stepTotal,
      cycle: 1,
      cycleTotal: totalCycles,
      label: null,
      board: null,
    });

    try {
      outer: for (let c = 1; c <= totalCycles; c++) {
        for (let i = 0; i < stepTotal; i++) {
          if (cancelRunRef.current) break outer;

          const node = result.order[i];
          const settings = node.data?.settings ?? {};

          setRunStatus({
            current: i + 1,
            total: stepTotal,
            cycle: c,
            cycleTotal: totalCycles,
            label: node.data?.label ?? node.id,
            board: settings.boardVal ?? (node.type === 'spectrometer' ? 'spec' : '?'),
          });

          const res = await executeNode(node);

          if (cancelRunRef.current) break outer;

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            if (errBody.cancelled || cancelRunRef.current) break outer;
            throw new Error(
              errBody.error || `Send failed for ${node.data?.label ?? node.id}`
            );
          }

          if (i < stepTotal - 1) {
            const nextId = result.order[i + 1].id;
            const edge = edges.find(
              (e) => e.source === node.id && e.target === nextId
            );
            const waitMs = stepWaitMs(edge?.data);
            if (waitMs > 0) {
              await abortableSleep(waitMs, cancelRunRef, (remainingMs) => {
                const label = `Waiting ${formatCountdown(remainingMs)}`;
                setRunStatus((prev) => {
                  if (!prev || prev.label === label) return prev;
                  return { ...prev, label, board: null };
                });
              });
              if (cancelRunRef.current) break outer;
            }
          }
        }
      }

      if (cancelRunRef.current) {
        setRunStatus((prev) =>
          prev ? { ...prev, aborted: true, error: null } : prev
        );
      } else {
        setRunStatus(null);
      }
    } catch (err) {
      console.error(err);
      setRunStatus((prev) => ({
        ...(prev ?? {
          current: 0,
          total: stepTotal,
          cycle: 1,
          cycleTotal: totalCycles,
        }),
        error: err.message || 'Send All failed.',
        aborted: false,
      }));
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, nodes, edges, cycleCount]);

  return {
    isRunning,
    runStatus,
    setRunStatus,
    onSendAll,
    onAbort,
  };
}
