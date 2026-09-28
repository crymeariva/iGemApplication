import { memo, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeToolbar,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react';
import { DEFAULT_STEP_WAIT, formatStepWait } from '../../stepTiming';
import './ConnectionEdge.css';

/**
 * Workflow connection between hardware nodes.
 * Optional wait (h/m/s) is edited via EdgeToolbar when selected.
 */
function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}) {
  const { setEdges } = useReactFlow();
  const wait = { ...DEFAULT_STEP_WAIT, ...(data ?? {}) };
  const label = formatStepWait(wait);

  const [edgePath, centerX, centerY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const patchWait = useCallback(
    (field, raw) => {
      const trimmed = String(raw).trim();
      const value =
        trimmed === '' ? 0 : Math.max(0, parseInt(trimmed, 10) || 0);
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? {
                ...e,
                data: {
                  ...DEFAULT_STEP_WAIT,
                  ...(e.data ?? {}),
                  [field]: value,
                },
              }
            : e
        )
      );
    },
    [id, setEdges]
  );

  const inputValue = (n) => (n ? String(n) : '');

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="connection-edge__label"
            style={{
              transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      <EdgeToolbar
        edgeId={id}
        x={centerX}
        y={centerY}
        isVisible={selected}
        alignY="bottom"
        className="connection-edge__toolbar"
      >
        <label className="connection-edge__field">
          <span>h</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={inputValue(wait.delayHours)}
            onChange={(e) => patchWait('delayHours', e.target.value)}
          />
        </label>
        <label className="connection-edge__field">
          <span>m</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={inputValue(wait.delayMinutes)}
            onChange={(e) => patchWait('delayMinutes', e.target.value)}
          />
        </label>
        <label className="connection-edge__field">
          <span>s</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={inputValue(wait.delaySeconds)}
            onChange={(e) => patchWait('delaySeconds', e.target.value)}
          />
        </label>
      </EdgeToolbar>
    </>
  );
}

export default memo(ConnectionEdge);
