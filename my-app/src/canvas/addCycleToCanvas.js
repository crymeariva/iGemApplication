const DEFAULT_NODE_LABELS = {
  peristalticPump: 'Peristaltic Pump',
  syringePump: 'Syringe Pump',
  thermometer: 'Thermometer',
  spectrometer: 'Spectrometer',
  electroporator: 'Electroporator',
};

export function applyCycleToCanvas(cycle, { setNodes, setEdges, updateNodeSettings }) {
  setNodes(
    cycle.nodes.map((node, i) => {
      const id = node.id || `gen-${i + 1}`;
      return {
        id,
        type: node.type,
        position: node.position ?? { x: 80 + i * 220, y: 160 },
        data: {
          label: DEFAULT_NODE_LABELS[node.type] || node.type,
          settings: node.data?.settings ?? {},
          onSettingsChange: (update) => updateNodeSettings(id, update),
        },
      };
    })
  );

  setEdges(
    cycle.edges.map((e, i) => ({
      id: e.id || `e-${i + 1}`,
      source: e.source,
      target: e.target,
    }))
  );
}
