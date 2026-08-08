import { memo, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import './HardwareNode.css';

const STEPS_PER_ROTATION = 200;

const PeristalticPumpNode = ({ data, isConnectable, selected }) => {
    const [rotations, setRotations] = useState(
        data.settings?.rotations ?? ''
    );

    const [boardVal, setBoard] = useState(
        data.settings?.boardVal || ''
    );

    const [axisVal, setAxis] = useState(
        data.settings?.axis || ''
    );

    const [directionVal, setDirection] = useState(
        data.settings?.direction || ''
    );

    const [speedVal, setSpeed] = useState(
        data.settings?.speed || 'S'
    );

    const [message, setMessage] = useState("");

    useEffect(() => {
        setRotations(data.settings?.rotations ?? '');
    }, [data.settings?.rotations]);

    useEffect(() => {
        setBoard(data.settings?.boardVal ?? '');
    }, [data.settings?.boardVal]);

    useEffect(() => {
        setAxis(data.settings?.axis ?? '');
    }, [data.settings?.axis]);

    useEffect(() => {
        setDirection(data.settings?.direction ?? '');
    }, [data.settings?.direction]);

    useEffect(() => {
        setSpeed(data.settings?.speed ?? 'S');
    }, [data.settings?.speed]);

    const steps = Math.round(Number(rotations) * STEPS_PER_ROTATION);

    const CallBackend = async (payload) => {
        try {
            const res = await fetch("http://localhost:5001/api/instr", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await res.json();
            setMessage(result.message);
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

            const result = await res.json();
            setMessage(result.message);
        } catch (err) {
            console.error("Cancel error:", err);
        }
    };

    const handleRotationsChange = (e) => {
        setRotations(e.target.value);
        if (data.onSettingsChange) {
            data.onSettingsChange({ rotations: e.target.value });
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

    const handleSpeedChange = (e) => {
        setSpeed(e.target.value);
        if (data.onSettingsChange) {
            data.onSettingsChange({ speed: e.target.value });
        }
    };

    return (
        <div className={`hardware-node peristalticPump-node ${selected ? 'selected' : ''}`}>
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
                    {data.label || 'Peristaltic Pump'}
                </div>

                <div className="hardware-node-settings">
                    <div className="setting-item">
                        <span className="setting-key">Rotations:</span>
                        <input
                            type="number"
                            className="setting-input"
                            value={rotations}
                            min={0.1}
                            step={0.1}
                            onChange={handleRotationsChange}
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
                        <span className="setting-key">Direction (Forward, Reverse):</span>
                        <select
                            className="setting-select"
                            value={directionVal}
                            onChange={handleDirectionChange}
                        >
                            <option value="">Select</option>
                            <option value="up">Forward</option>
                            <option value="down">Reverse</option>
                        </select>
                    </div>
                    <div className="setting-item">
                        <span className="setting-key">Speed:</span>
                        <select
                        className="setting-select"
                        value={speedVal}
                        onChange={handleSpeedChange}
                        >
                            <option value="S">Slow</option>
                            <option value="F">Fast</option>                            
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
                            compInstr: { steps, Direction: directionVal, Speed: speedVal || 'S' }
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
}

export default memo(PeristalticPumpNode);
