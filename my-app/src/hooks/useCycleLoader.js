import { useCallback, useState } from 'react';
import { getCycle, listCycles } from '../api/cyclesApi';

export function useCycleLoader({ setNodes, setEdges, updateNodeSettings }) {
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [savedCycles, setSavedCycles] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState(null);
  const [activeCycleName, setActiveCycleName] = useState('');

  /**
   * Opens modal and fetches saved cycles.
   */
  const handleOpenLoadMenu = useCallback(async () => {
    setShowLoadMenu(true);

    try {
      const res = await listCycles();

      if (!res.ok) {
        setSavedCycles([]);
        return;
      }

      setSavedCycles(res.data);
    } catch (e) {
      console.error('Load error:', e);
      alert('Failed to load cycles.');
      setSavedCycles([]);
    }
  }, []);

  /**
   * Loads a cycle into the canvas.
   */
  const handleLoadCycle = useCallback(async (cycle) => {
    try {
      const res = await getCycle(cycle.id);

      if (!res.ok) {
        alert('Failed to load cycle.');
        return;
      }

      setNodes(
        res.data.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            onSettingsChange: (update) =>
              updateNodeSettings(node.id, update),
          },
        }))
      );

      setEdges(
        (res.data.edges ?? []).map((edge, i) => ({
          id: edge.id || `e-${i + 1}`,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'connection',
          animated: edge.animated !== false,
          data: {
            delayHours: 0,
            delayMinutes: 0,
            delaySeconds: 0,
            ...(edge.data ?? {}),
          },
        }))
      );

      setShowLoadMenu(false);

      setActiveCycleId(cycle.id);
      setActiveCycleName(cycle.name ?? '');
    } catch (e) {
      console.error('Failed to load cycle:', e);
      alert('Failed to load cycle.');
    }
  }, [setNodes, setEdges, updateNodeSettings]);

  return {
    showLoadMenu,
    setShowLoadMenu,
    savedCycles,
    setSavedCycles,
    activeCycleId,
    setActiveCycleId,
    activeCycleName,
    setActiveCycleName,
    handleOpenLoadMenu,
    handleLoadCycle,
  };
}
