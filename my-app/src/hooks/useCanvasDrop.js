import { useCallback, useRef, useState } from 'react';

export function useCanvasDrop({ setNodes, updateNodeSettings }) {
  const nodeId = useRef(0);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  /**
   * Handles drag over.
   */
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Handles node drop.
   */
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const raw = event.dataTransfer.getData(
        'application/reactflow'
      );

      if (!raw) return;

      let parsed;

      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const position =
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

      const newId = `node-${nodeId.current++}`;

      setNodes((nds) =>
        nds.concat({
          id: newId,
          type: parsed.type ?? 'default',
          position,
          data: {
            label: parsed.label ?? 'Node',
            settings: parsed.settings ?? {},
            onSettingsChange: (update) =>
              updateNodeSettings(newId, update),
          },
        })
      );
    },
    [reactFlowInstance, setNodes, updateNodeSettings]
  );

  /**
   * Restarts node ids from node-0 (used when the canvas is reset).
   */
  const resetNodeIds = useCallback(() => {
    nodeId.current = 0;
  }, []);

  return {
    onInit: setReactFlowInstance,
    onDragOver,
    onDrop,
    resetNodeIds,
  };
}
