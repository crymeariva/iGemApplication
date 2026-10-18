import { useCallback } from 'react';
import { createCycle, updateCycle } from '../api/cyclesApi';

/**
 * Saves a cycle to the database
 *
 * - onSaveCycle: overwrites the active cycle if one is loaded, otherwise saves as new.
 * - onSaveAsNew: always prompts for a name and saves a brand new cycle.
 * 
 */
export function useCycleSave({
  nodes,
  edges,
  activeCycleId,
  activeCycleName,
  setActiveCycleId,
  setActiveCycleName,
}) {
  const saveAsNewCycle = useCallback(
    async (name) => {
      const trimmed = (name ?? '').trim();
      if (!trimmed) return;

      try {
        const res = await createCycle({ name: trimmed, nodes, edges });
        if (!res.ok) {
          console.error('Save failed:', res.data);
          alert('Failed to save cycle.');
          return;
        }

        const newId = res.data?.id;
        if (newId != null) {
          setActiveCycleId(newId);
          setActiveCycleName(trimmed);
        }

        console.log('Saved cycle with id:', newId);
        alert('Cycle saved');
      } catch (e) {
        console.error('Save error:', e);
        alert('Error saving cycle.');
      }
    },
    [nodes, edges, setActiveCycleId, setActiveCycleName]
  );

  const onSaveCycle = useCallback(async () => {
    if (activeCycleId != null) {
      try {
        const res = await updateCycle(activeCycleId, { nodes, edges });
        if (!res.ok) {
          console.error('Overwrite failed:', res.data);
          alert('Failed to overwrite cycle.');
          return;
        }

        const label = activeCycleName ? `"${activeCycleName}"` : `#${activeCycleId}`;
        alert(`Cycle ${label} updated`);
        return;
      } catch (e) {
        console.error('Overwrite error:', e);
        alert('Error overwriting cycle.');
        return;
      }
    }

    const name = window.prompt('Name this cycle:');
    if (!name) return;
    await saveAsNewCycle(name);
  }, [activeCycleId, activeCycleName, nodes, edges, saveAsNewCycle]);

  const onSaveAsNew = useCallback(async () => {
    const name = window.prompt('Name the new cycle:');
    if (!name) return;
    await saveAsNewCycle(name);
  }, [saveAsNewCycle]);

  return { onSaveCycle, onSaveAsNew, saveAsNewCycle };
}
