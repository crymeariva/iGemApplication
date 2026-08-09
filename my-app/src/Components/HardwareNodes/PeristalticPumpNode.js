import { memo, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import './HardwareNode.css';

// open to change
const STEPS = 1000;

// maybe also consider doing something about the forward / reverse instruction?
// currently only changed on the UI side of things to make more sense for the user

const PeristalticPumpNode = ({ data, isConnectable, selected }) => {
    const [boardVal, setBoard] = useState(
        data.settings?.boardVal || ''
    );

    const [axisVal, setAxis] = useState(
        data.settings?.axis || ''
    );

    const [directionVal, setDirection] = useState(
        data.settings?.direction || ''
    );

    const [message, setMessage] = useState("");

    useEffect(() => {
        setBoard(data.settings?.boardVal ?? '');
    }, [data.settings?.boardVal]);

    useEffect(() => {
        setAxis(data.settings?.axis ?? '');
    }, [data.settings?.axis]);

    useEffect(() => {
        setDirection(data.settings?.direction ?? '');
    }, [data.settings?.direction]);

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
                </div>
            </div>

            <button
                className="node-action-btn"
                onClick={() =>
                    CallBackend({
                        type: "Motor",
                        axis: axisVal,
                        board: Number(boardVal),
                        compInstr: { steps: STEPS, Direction: directionVal }
                    })
                }
            >
                Send Instruction
            </button>

            {message && <p className="node-message">{message}</p>}
        </div>
    );
}

export default memo(PeristalticPumpNode);
