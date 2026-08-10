import './styles/App.css';
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import LoadCycleDialog from './Components/LoadCycleDialog';
import ThermometerNode from './Components/HardwareNodes/ThermometerNode';
import SyringePumpNode from './Components/HardwareNodes/SyringePumpNode';
import ElectroporatorNode from './Components/HardwareNodes/ElectroporatorNode';
import PeristalticPumpNode from './Components/HardwareNodes/PeristalticPumpNode';
import SpectrometerNode from './Components/HardwareNodes/SpectrometerNode';
import Sidemenu from './Components/SideMenu/Sidemenu';
import SystemPanel from "./Components/SystemPanel/SystemPanel";

import { useCycleSave } from './hooks/useCycleSave';
import { useCycleLoader } from './hooks/useCycleLoader';
import { useCycleDelete } from './hooks/useCycleDelete';
import {
  periRotationsToSteps,
  syringeMlToSteps,
} from './pumpCalibration';

const RUNNABLE_TYPES = new Set(['syringePump', 'peristalticPump']);
const INTER_NODE_DELAY_MS = 3000; // Gonna have to change this / remove entirely to implement a 'finish then next'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function getNodeOrder(nodes, edges) {
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

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const nodeId = useRef(0);
  const cancelRunRef = useRef(false);

  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [showSystemPanel, setShowSystemPanel] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState(null);
  const [cycleCount, setCycleCount] = useState(1);

  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

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
      setEdges((eds) => addEdge(connection, eds)),
    []
  );

  /**
   * Resets canvas.
   */
  const onResetCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);

    nodeId.current = 0;

    setActiveCycleId(null);
    setActiveCycleName('');
  }, [setActiveCycleId, setActiveCycleName]);

  /**
   * Toggles dark mode.
   */
  const onToggleDarkMode = useCallback(() => {
    const el = document.documentElement;

    if (el.getAttribute('data-theme') === 'dark') {
      el.removeAttribute('data-theme');
      setIsDarkMode(false);
    } else {
      el.setAttribute('data-theme', 'dark');
      setIsDarkMode(true);
    }
  }, []);

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
    [reactFlowInstance, updateNodeSettings]
  );

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
   * Aborts any in-progress Send All run and halts hardware on all boards.
   */
  const onAbort = useCallback(async () => {
    cancelRunRef.current = true;
    setRunStatus((prev) => (prev ? { ...prev, aborted: true, error: null } : prev));

    try {
      await fetch('http://localhost:5001/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  /**
   * Walks the node chain and sends each instruction in order (V1: delay between sends).
   * Repeats the full chain `cycleCount` times.
   */
  const onSendAll = useCallback(async () => {
    if (isRunning) return;

    const result = getNodeOrder(nodes, edges);
    if (!result.ok) {
      alert(result.error);
      return;
    }

    for (const node of result.order) {
      const settings = node.data?.settings ?? {};
      const label = node.data?.label ?? node.id;

      if (!settings.boardVal || !settings.axis || !settings.direction) {
        alert(`Missing board/axis/direction on "${label}".`);
        return;
      }

      if (node.type === 'syringePump' && !syringeMlToSteps(settings.volumeMl)) {
        alert(`Missing or invalid volume (mL) on "${label}".`);
        return;
      }

      if (node.type === 'peristalticPump' && !periRotationsToSteps(settings.rotations)) {
        alert(`Missing or invalid rotations on "${label}".`);
        return;
      }
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
            board: settings.boardVal ?? '?',
          });

          const payload = buildNodePayload(node);

          const res = await fetch('http://localhost:5001/api/instr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(
              errBody.error || `Send failed for ${node.data?.label ?? node.id}`
            );
          }

          const isLastStep = i === stepTotal - 1;
          const isLastCycle = c === totalCycles;

          if (!isLastStep || !isLastCycle) {
            await sleep(INTER_NODE_DELAY_MS);
            if (cancelRunRef.current) break outer;
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
              Current: {runStatus.label}, Board: {runStatus.board}
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
      />

      <LoadCycleDialog
        open={showLoadMenu}
        cycles={savedCycles}
        onClose={() => setShowLoadMenu(false)}
        onLoad={handleLoadCycle}
        onDelete={deleteCycle}
      />

      {showSystemPanel && <SystemPanel nodes={nodes} edges={edges} />}

      <div className="app-canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            animated: true,
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
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