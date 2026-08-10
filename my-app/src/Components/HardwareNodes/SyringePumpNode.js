import { memo, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { syringeMlToSteps } from '../../pumpCalibration';
import './HardwareNode.css';

const SyringePumpNode = ({ data, isConnectable, selected }) => {
  const [volumeMl, setVolumeMl] = useState(
    data.settings?.volumeMl || ''
  );

  const [boardVal, setBoard] = useState(
    data.settings?.boardVal || ''
  );

  const [message, setMessage] = useState("");

  const [axisVal, setAxis] = useState(
    data.settings?.axis || ''
  );

  const [directionVal, setDirection] = useState(
    data.settings?.direction || ''
  );

  useEffect(() => {
    setVolumeMl(data.settings?.volumeMl ?? '');
  }, [data.settings?.volumeMl]);

  useEffect(() => {
    setBoard(data.settings?.boardVal ?? '');
  }, [data.settings?.boardVal]);

  useEffect(() => {
    setAxis(data.settings?.axis ?? '');
  }, [data.settings?.axis]);

  useEffect(() => {
    setDirection(data.settings?.direction ?? '');
  }, [data.settings?.direction]);

  const steps = syringeMlToSteps(volumeMl);

  const CallBackend = async (payload) => {
    try {
      const res = await fetch("http://localhost:5001/api/instr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setMessage(data.message);
    } catch (err) {
      console.error("Backend error:", err);
    }
  };

  const CallCancel = async () => {
    try {
      const res = await fetch("http://localhost:5001/api/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ board: Number(boardVal) }),
      });

      const data = await res.json();
      setMessage(data.message);
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleVolumeChange = (e) => {
    setVolumeMl(e.target.value);

    if (data.onSettingsChange) {
      data.onSettingsChange({ volumeMl: e.target.value });
    }
  };

  const handleBoardChange = (e) => {
    setBoard(e.target.value);

    if (data.onSettingsChange) {
      data.onSettingsChange({ boardVal: e.target.value });
    }
  };

  const handleAxisChange = (e) => {
    setAxis(e.target.value);

    if (data.onSettingsChange) {
      data.onSettingsChange({ axis: e.target.value });
    }
  };

  const handleDirectionChange = (e) => {
    setDirection(e.target.value);

    if (data.onSettingsChange) {
      data.onSettingsChange({ direction: e.target.value });
    }
  };

  return (
    <div className={`hardware-node syringePump-node ${selected ? 'selected' : ''}`}>
      <Handle
        id="target"
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ left: '25%' }}
      />

      <Handle
        id="source"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ left: '75%' }}
      />

      <div className="hardware-node-content">
        <div className="hardware-node-header">
          {data.label || 'Syringe Pump'}
        </div>

        <div className="hardware-node-settings">
          <div className="setting-item">
            <span className="setting-key">Volume (mL):</span>
            <input
              type="number"
              className="setting-input"
              value={volumeMl}
              min={0.1}
              step={0.1}
              onChange={handleVolumeChange}
              placeholder="1"
            />
          </div>
          <div className="setting-item">
            <span className="setting-key">Board (1-4):</span>
            <select
              className="setting-select"
              value={boardVal}
              onChange={handleBoardChange}
            >
              <option value="">Select</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
          <div className="setting-item">
            <span className="setting-key">Axis (X, Y, Z, A):</span>
            <select
              className="setting-select"
              value={axisVal}
              onChange={handleAxisChange}
            >
              <option value="">Select</option>
              <option value="X">X</option>
              <option value="Y">Y</option>
              <option value="Z">Z</option>
              <option value="A">A</option>
            </select>
          </div>
          <div className="setting-item">
            <span className="setting-key">Dispense / Aspirate:</span>
            <select
              className="setting-select"
              value={directionVal}
              onChange={handleDirectionChange}
            >
              <option value="">Select</option>
              <option value="up">Dispense</option>
              <option value="down">Aspirate</option>
            </select>
          </div>
        </div>
      </div>

      <div className="node-actions">
        <button
          className="node-action-btn"
          disabled={!steps}
          onClick={() =>
            CallBackend({
              type: "Motor",
              axis: axisVal,
              board: Number(boardVal),
              compInstr: {
                steps,
                Direction: directionVal,
                Speed: 'S',
              },
            })
          }
        >
          Send Instruction
        </button>
        <button
          className="node-action-btn node-action-btn--cancel"
          disabled={!boardVal}
          onClick={CallCancel}
        >
          Cancel
        </button>
      </div>
      {message && <p className="node-message">{message}</p>}
    </div>
  );
};

export default memo(SyringePumpNode);
