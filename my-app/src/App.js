import './styles/App.css';
import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import LoadCycleDialog from './Components/LoadCycleDialog/LoadCycleDialog';
import ThermometerNode from './Components/HardwareNodes/ThermometerNode';
import SyringePumpNode from './Components/HardwareNodes/SyringePumpNode';
import ElectroporatorNode from './Components/HardwareNodes/ElectroporatorNode';
import PeristalticPumpNode from './Components/HardwareNodes/PeristalticPumpNode';
import SpectrometerNode from './Components/HardwareNodes/SpectrometerNode';
import ConnectionEdge from './Components/Edges/ConnectionEdge';
import Sidemenu from './Components/SideMenu/Sidemenu';
import SystemPanel from "./Components/SystemPanel/SystemPanel";
import AgentMenu from './Components/AgentMenu/AgentMenu';
import AgentSettingsDialog from './Components/AgentSettingsDialog/AgentSettingsDialog';

import { useCycleSave } from './hooks/useCycleSave';
import { useCycleLoader } from './hooks/useCycleLoader';
import { useCycleDelete } from './hooks/useCycleDelete';
import { useDarkMode } from './hooks/useDarkMode';
import { useCanvasDrop } from './hooks/useCanvasDrop';
import { useCycleRun } from './hooks/useCycleRun';
import { applyCycleToCanvas } from './utils/addCycleToCanvas';
import { DEFAULT_STEP_WAIT } from './utils/stepTiming';

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const [showSystemPanel, setShowSystemPanel] = useState(false);

  const [cycleCount, setCycleCount] = useState(1);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);

  /**
   * Dark mode hook.
   */
  const { isDarkMode, onToggleDarkMode } = useDarkMode();

  /**
   * Updates node settings.
   */
  const updateNodeSettings = useCallback((id, update) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;

        const prevSettings = n.data?.settings ?? {};

        return {
          ...n,
          data: {
            ...(n.data ?? {}),
            settings: {
              ...prevSettings,
              ...(update ?? {}),
            },
          },
        };
      })
    );
  }, []);

  /**
   * Canvas drag-and-drop hook.
   */
  const { onInit, onDragOver, onDrop, resetNodeIds } = useCanvasDrop({
    setNodes,
    updateNodeSettings,
  });

  /**
   * Cycle loading hook.
   */
  const {
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
  } = useCycleLoader({
    setNodes,
    setEdges,
    updateNodeSettings,
  });

  /**
   * Cycle delete hook.
   */
  const { deleteCycle } = useCycleDelete({
    setSavedCycles,
  });

  /**
   * Cycle save hook.
   */
  const { onSaveCycle, onSaveAsNew } = useCycleSave({
    nodes,
    edges,
    activeCycleId,
    activeCycleName,
    setActiveCycleId,
    setActiveCycleName,
  });

  /**
   * Cycle applied from agent.
   */
  const onApplyCycle = useCallback(
    (cycle) => {
      applyCycleToCanvas(cycle, { setNodes, setEdges, updateNodeSettings });
      setActiveCycleId(null);
      setActiveCycleName('');
    },
    [updateNodeSettings, setActiveCycleId, setActiveCycleName]
  );

  /**
   * Node types.
   */
  const nodeTypes = useMemo(
    () => ({
      thermometer: ThermometerNode,
      syringePump: SyringePumpNode,
      spectrometer: SpectrometerNode,
      electroporator: ElectroporatorNode,
      peristalticPump: PeristalticPumpNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      connection: ConnectionEdge,
    }),
    []
  );

  /**
   * ReactFlow handlers.
   */
  const onNodesChange = useCallback(
    (changes) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'connection',
            animated: true,
            data: { ...DEFAULT_STEP_WAIT },
          },
          eds
        )
      ),
    []
  );

  /**
   * Resets canvas.
   */
  const onResetCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);

    resetNodeIds();

    setActiveCycleId(null);
    setActiveCycleName('');
  }, [resetNodeIds, setActiveCycleId, setActiveCycleName]);

  /**
   * Prevent duplicate source connections.
   */
  const isValidConnection = useCallback(
    (connection) => {
      const sourceKey = (v) => v ?? null;

      const hasConnection = edges.some(
        (edge) =>
          edge.source === connection.source &&
          sourceKey(edge.sourceHandle) ===
          sourceKey(connection.sourceHandle)
      );

      return !hasConnection;
    },
    [edges]
  );

  /**
   * Send All / Abort hook.
   */
  const { isRunning, runStatus, setRunStatus, onSendAll, onAbort } = useCycleRun({
    nodes,
    edges,
    cycleCount,
  });

  return (
    <div className="App">
      <header className="app-header">
        <div className="app-header__left">
          <button
            className="menu-toggle"
            onClick={() =>
              setIsMenuOpen(!isMenuOpen)
            }
            aria-label="Toggle menu"
          >
            ☰
          </button>

          <h1 className="app-header__title">
            MOSMAGE Control Interface
          </h1>
          <label className="cycle-count">
            Cycles
            <input
              className="cycle-count__input"
              type="number"
              min={1}
              value={cycleCount}
              disabled={isRunning}
              onChange={(e) =>
                setCycleCount(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>
          <button
            className="btn-send-all"
            onClick={onSendAll}
            disabled={isRunning}
          >
            {isRunning ? 'Running...' : 'Send All'}
          </button>
          <button
            className="btn-abort"
            onClick={onAbort}
          >
            Abort
          </button>
        </div>

        <div className="app-header__actions">
          <button
            className="btn-secondary"
            onClick={() =>
              setShowSystemPanel(!showSystemPanel)
            }
          >
            {showSystemPanel
              ? 'Hide System Panel'
              : 'System Panel'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsAgentOpen((open) => !open)}
            aria-label="Open assistant"
            aria-pressed={isAgentOpen}
          >
            {isAgentOpen ? 'Hide Agent' : 'Agent'}
          </button>
        </div>
      </header>

      {runStatus && (
        <div
          className={
            'run-status' +
            (runStatus.error ? ' run-status--error' : '') +
            (runStatus.aborted ? ' run-status--aborted' : '')
          }
        >
          <span className="run-status__count">
            Cycle {runStatus.cycle} of {runStatus.cycleTotal}
            {' · '}
            {runStatus.current} of {runStatus.total}
          </span>
          {runStatus.error ? (
            <span className="run-status__msg">{runStatus.error}</span>
          ) : runStatus.aborted ? (
            <span className="run-status__msg">Aborted</span>
          ) : runStatus.label ? (
            <span className="run-status__msg">
              {runStatus.board != null
                ? `Current: ${runStatus.label}, Board: ${runStatus.board}`
                : runStatus.label}
            </span>
          ) : (
            <span className="run-status__msg">Starting…</span>
          )}
          {(runStatus.error || runStatus.aborted) && (
            <button
              type="button"
              className="run-status__dismiss"
              onClick={() => setRunStatus(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      <Sidemenu
        isOpen={isMenuOpen}
        toggleMenu={() =>
          setIsMenuOpen(!isMenuOpen)
        }
        onResetCanvas={onResetCanvas}
        onToggleDarkMode={onToggleDarkMode}
        isDarkMode={isDarkMode}
        onSaveCycle={onSaveCycle}
        onSaveAsNew={onSaveAsNew}
        activeCycleName={activeCycleName}
        onOpenLoadMenu={handleOpenLoadMenu}
        onOpenAgentSettings={() => setShowAgentSettings(true)}
      />

      <AgentMenu
        isOpen={isAgentOpen}
        nodes={nodes}
        edges={edges}
        cycleName={activeCycleName}
        onApplyCycle={onApplyCycle}
      />

      <LoadCycleDialog
        open={showLoadMenu}
        cycles={savedCycles}
        onClose={() => setShowLoadMenu(false)}
        onLoad={handleLoadCycle}
        onDelete={deleteCycle}
      />

      <AgentSettingsDialog
        open={showAgentSettings}
        onClose={() => setShowAgentSettings(false)}
      />

      {showSystemPanel && <SystemPanel nodes={nodes} edges={edges} />}

      <div className="app-canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: 'connection',
            animated: true,
            data: { ...DEFAULT_STEP_WAIT },
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          onDrop={onDrop}
          onDragOver={onDragOver}
          isValidConnection={isValidConnection}
          fitView
        >
          <Background />
          <Controls position="top-right" />
        </ReactFlow>
      </div>
    </div>
  );
}

export default App;
