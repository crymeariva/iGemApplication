import { memo, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import './HardwareNode.css';

const SpectrometerNode = ({ data, isConnectable, selected }) => {
    const [metric, setMetric] = useState(data.settings?.metric || 'raw');
    const [target, setTarget] = useState(data.settings?.target || '');
    const [durationSec, setDurationSec] = useState(data.settings?.durationSec ?? '');
    const [live, setLive] = useState(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        setMetric(data.settings?.metric || 'raw');
    }, [data.settings?.metric]);

    useEffect(() => {
        setTarget(data.settings?.target ?? '');
    }, [data.settings?.target]);

    useEffect(() => {
        setDurationSec(data.settings?.durationSec ?? '');
    }, [data.settings?.durationSec]);

    useEffect(() => {
        let cancelled = false;

        const tick = async () => {
            try {
                const res = await fetch('http://localhost:5001/api/spec/reading');
                const result = await res.json();
                if (!cancelled) {
                    setLive(result);
                }
            } catch (err) {
                if (!cancelled) {
                    setLive({ ok: false, error: err.message });
                }
            }
        };

        tick();
        const id = setInterval(tick, 500);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    const handleMetricChange = (e) => {
        setMetric(e.target.value);
        if (data.onSettingsChange) {
            data.onSettingsChange({ metric: e.target.value });
        }
    };

    const handleTargetChange = (e) => {
        setTarget(e.target.value);
        if (data.onSettingsChange) {
            data.onSettingsChange({ target: e.target.value });
        }
    };

    const handleDurationChange = (e) => {
        setDurationSec(e.target.value);
        if (data.onSettingsChange) {
            data.onSettingsChange({ durationSec: e.target.value });
        }
    };

    const CallWait = async () => {
        setMessage('Waiting...');
        try {
            const res = await fetch('http://localhost:5001/api/spec/wait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    metric,
                    target: Number(target),
                    durationSec: Number(durationSec),
                }),
            });

            const result = await res.json();
            if (result.ok) {
                setMessage(`Average ${result.average.toFixed(4)} over ${result.samples} samples`);
            } else {
                setMessage(result.error || 'Wait failed');
            }
        } catch (err) {
            console.error("Backend error:", err);
        }
    };

    const liveVal = live?.ok ? (metric === 'voltage' ? live.voltage : live.raw) : null;


    return (
        <div className={`hardware-node spectrometer-node ${selected ? 'selected' : ''}`}>
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
                    {data.label || 'Spectrometer'}
                </div>

                <div className="hardware-node-settings">
                    <div className="setting-item">
                        <span className="setting-key">Live:</span>
                        <span>
                            {live?.ok
                                ? `${liveVal} ${metric === 'voltage' ? 'V' : 'raw'}`
                                : (live?.error || '…')}
                        </span>
                    </div>
                    <div className="setting-item">
                        <span className="setting-key">Port:</span>
                        <select
                            className="setting-select"
                        >
                        </select>
                    </div>
                    <div className="setting-item">
                        <span className="setting-key">Metric (Raw, Voltage):</span>
                        <select
                            className="setting-select"
                            value={metric}
                            onChange={handleMetricChange}
                        >
                            <option value="raw">Raw</option>
                            <option value="voltage">Voltage</option>
                        </select>
                    </div>

                    <div className="setting-item">
                        <span className="setting-key">Target:</span>
                        <input
                            type="number"
                            className="setting-input"
                            value={target}
                            step="any"
                            onChange={handleTargetChange}
                            placeholder="xx"
                        />
                    </div>
                    <div className="setting-item">
                        <span className="setting-key">Duration (s):</span>
                        <input
                            type="number"
                            className="setting-input"
                            value={durationSec}
                            min={0.1}
                            step={0.1}
                            onChange={handleDurationChange}
                            placeholder="xx"
                        />
                    </div>
                </div>
            </div>

            <div className="node-actions">
                <button
                className="node-action-btn"
                disabled={!target || !durationSec}
                onClick={CallWait}
                >
                    Send (Wait For Average)
                </button>
            </div>

            {message && <p className="node-message">{message}</p>}
        </div>
    );
}

export default memo(SpectrometerNode);
