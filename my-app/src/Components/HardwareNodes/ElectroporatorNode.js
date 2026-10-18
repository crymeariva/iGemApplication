import { memo, useCallback, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { API_BASE } from '../../api/config';
import {
    BURST_MAX_MS,
    BURST_MIN_MS,
    MAX_VOLTAGE,
    MIN_DISCHARGE_VOLT,
    TIME_ON_MAX_S,
    TIME_ON_MIN_S,
    chargeBody,
    dischargeBody,
    isComplete,
    settingsError as getSettingsError,
    withDefaults,
} from '../../utils/electroporator';
import NodeHeader from './NodeHeader';
import './HardwareNode.css';

const API = `${API_BASE}/electro`;
const ARM_TIMEOUT_MS = 60 * 1000;

const ElectroporatorNode = ({ data, isConnectable, selected }) => {
    const initial = withDefaults(data.settings);
    const [port, setPort] = useState(data.settings?.port || '');
    const [chargeMode, setChargeMode] = useState(initial.chargeMode);
    const [chargeMin, setChargeMin] = useState(initial.chargeMin);
    const [chargeV, setChargeV] = useState(initial.chargeV);
    const [dischargeMode, setDischargeMode] = useState(initial.dischargeMode);
    const [minV, setMinV] = useState(initial.minV);
    const [burstMs, setBurstMs] = useState(initial.burstMs);
    const [timeOnSec, setTimeOnSec] = useState(initial.timeOnSec);
    const [ports, setPorts] = useState([]);
    const [live, setLive] = useState(null);
    const [message, setMessage] = useState('');
    const [armed, setArmed] = useState(false);
    const [expanded, setExpanded] = useState(() => !isComplete(data.settings || {}));

    useEffect(() => {
        const s = withDefaults(data.settings);
        setPort(data.settings?.port ?? '');
        setChargeMode(s.chargeMode);
        setChargeMin(s.chargeMin);
        setChargeV(s.chargeV);
        setDischargeMode(s.dischargeMode);
        setMinV(s.minV);
        setBurstMs(s.burstMs);
        setTimeOnSec(s.timeOnSec);
    }, [data.settings]);

    const save = (key, value, setter) => {
        setter(value);
        setArmed(false);
        if (data.onSettingsChange) {
            data.onSettingsChange({ [key]: value });
        }
    };

    const refreshPorts = useCallback(() => {
        fetch(`${API_BASE}/spec/ports`)
            .then((res) => res.json())
            .then((result) => {
                if (result.ok) setPorts(result.ports);
            })
            .catch((err) => console.error(err));
    }, []);

    useEffect(() => {
        refreshPorts();
    }, [refreshPorts]);

    useEffect(() => {
        if (!armed) return;
        const id = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
        return () => clearTimeout(id);
    }, [armed]);

    // Expected shape: { ok, ready, powered, phase, voltage, warning, error }
    useEffect(() => {
        if (!port) {
            setLive({ ok: false, error: 'Select a port' });
            return;
        }

        let cancelled = false;

        const tick = async () => {
            try {
                const res = await fetch(`${API}/status?port=${encodeURIComponent(port)}`);
                const result = await res.json();
                if (!cancelled) setLive(result);
            } catch (err) {
                if (!cancelled) setLive({ ok: false, error: 'Backend not available' });
            }
        };

        tick();
        const id = setInterval(tick, 500);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [port]);

    const settings = { chargeMode, chargeMin, chargeV, dischargeMode, minV, burstMs, timeOnSec };
    // Empty fields block arming without an error message; only bad values show one.
    const complete = isComplete(settings);
    const settingsError = getSettingsError(settings);

    const connected = live?.ok && live?.ready;
    const powered = connected && live?.powered;
    const busy = connected && live?.phase && live.phase !== 'idle';
    const canArm = connected && !busy && !settingsError && complete;

    const post = async (path, body) => {
        try {
            const res = await fetch(`${API}/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port, ...body }),
            });
            const result = await res.json();
            setMessage(result.ok ? result.message || 'OK' : result.error || 'Failed');
        } catch (err) {
            console.error('Backend error:', err);
            setMessage(err.message);
        }
    };

    const CallRun = () => {
        setArmed(false);
        return post('run', { charge: chargeBody(settings), discharge: dischargeBody(settings) });
    };

    const CallCharge = () => {
        setArmed(false);
        return post('charge', chargeBody(settings));
    };

    const CallDischarge = () => {
        setArmed(false);
        return post('discharge', dischargeBody(settings));
    };

    // Never gated on the checkbox or settings.
    const CallCancel = () => {
        setArmed(false);
        return post('stop', {});
    };

    return (
        <div className={`hardware-node electroporator-node ${selected ? 'selected' : ''}`}>
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
                <NodeHeader
                    label={data.label || 'Electroporator'}
                    expanded={expanded}
                    onToggle={() => setExpanded((v) => !v)}
                />

                <div className="hardware-node-settings">
                    <div className="setting-item">
                        <span className="setting-key">Status:</span>
                        <span>
                            {connected
                                ? `${powered ? 'Powered' : 'Off'} · ${live.phase} · ${
                                      live.voltage != null ? `${live.voltage.toFixed(1)} V` : '— V'
                                  }`
                                : live?.error || (live?.ok ? 'Waiting for READY…' : '…')}
                        </span>
                    </div>

                    {expanded && (
                        <>
                            <div className="setting-item">
                                <span className="setting-key">Port:</span>
                                <select
                                    className="setting-select"
                                    value={port}
                                    onChange={(e) => save('port', e.target.value, setPort)}
                                    onFocus={refreshPorts}
                                >
                                    <option value="">Select</option>
                                    {ports.map((p) => (
                                        <option key={p.path} value={p.path}>
                                            {p.path}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="setting-item">
                                <span className="setting-key">Charge by:</span>
                                <select
                                    className="setting-select"
                                    value={chargeMode}
                                    onChange={(e) => save('chargeMode', e.target.value, setChargeMode)}
                                >
                                    <option value="time">Time</option>
                                    <option value="volt">Voltage</option>
                                </select>
                            </div>

                            {chargeMode === 'time' ? (
                                <div className="setting-item">
                                    <span className="setting-key">Charge time (min):</span>
                                    <input
                                        type="number"
                                        className="setting-input"
                                        value={chargeMin}
                                        min={0.1}
                                        step="any"
                                        onChange={(e) => save('chargeMin', e.target.value, setChargeMin)}
                                    />
                                </div>
                            ) : (
                                <div className="setting-item">
                                    <span className="setting-key">Charge to (V):</span>
                                    <input
                                        type="number"
                                        className="setting-input"
                                        value={chargeV}
                                        min={1}
                                        max={MAX_VOLTAGE}
                                        step="any"
                                        onChange={(e) => save('chargeV', e.target.value, setChargeV)}
                                        placeholder={`≤ ${MAX_VOLTAGE}`}
                                    />
                                </div>
                            )}

                            <div className="setting-item">
                                <span className="setting-key">Discharge:</span>
                                <div className="setting-toggle">
                                    <button
                                        type="button"
                                        className={dischargeMode === 'exp' ? 'active' : ''}
                                        onClick={() => save('dischargeMode', 'exp', setDischargeMode)}
                                    >
                                        Exp
                                    </button>
                                    <button
                                        type="button"
                                        className={dischargeMode === 'square' ? 'active' : ''}
                                        onClick={() => save('dischargeMode', 'square', setDischargeMode)}
                                    >
                                        Square
                                    </button>
                                </div>
                            </div>

                            {dischargeMode === 'exp' ? (
                                <div className="setting-item">
                                    <span className="setting-key">Min voltage (V):</span>
                                    <input
                                        type="number"
                                        className="setting-input"
                                        value={minV}
                                        min={MIN_DISCHARGE_VOLT}
                                        max={MAX_VOLTAGE}
                                        step="any"
                                        onChange={(e) => save('minV', e.target.value, setMinV)}
                                        placeholder={`≥ ${MIN_DISCHARGE_VOLT}`}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="setting-item">
                                        <span className="setting-key">Burst length (ms):</span>
                                        <input
                                            type="number"
                                            className="setting-input"
                                            value={burstMs}
                                            min={BURST_MIN_MS}
                                            max={BURST_MAX_MS}
                                            step={1}
                                            onChange={(e) => save('burstMs', e.target.value, setBurstMs)}
                                            placeholder={`${BURST_MIN_MS}–${BURST_MAX_MS}`}
                                        />
                                    </div>
                                    <div className="setting-item">
                                        <span className="setting-key">Time on (s):</span>
                                        <input
                                            type="number"
                                            className="setting-input"
                                            value={timeOnSec}
                                            min={TIME_ON_MIN_S}
                                            max={TIME_ON_MAX_S}
                                            step="any"
                                            onChange={(e) => save('timeOnSec', e.target.value, setTimeOnSec)}
                                            placeholder={`${TIME_ON_MIN_S}–${TIME_ON_MAX_S}`}
                                        />
                                    </div>
                                    <p className="setting-note">
                                        Recharges to max ({MAX_VOLTAGE} V) between bursts.
                                    </p>
                                </>
                            )}
                            <p className="setting-note">Drains the capacitor after every run and on Cancel.</p>
                        </>
                    )}

                    <label className="setting-item">
                        <span className="setting-key">Confirm settings</span>
                        <input
                            type="checkbox"
                            checked={armed}
                            disabled={!canArm}
                            onChange={(e) => setArmed(e.target.checked)}
                        />
                    </label>
                </div>
            </div>

            <div className="node-actions node-actions--top">
                <button className="node-action-btn" disabled={!armed} onClick={CallCharge}>
                    Charge
                </button>
                <button className="node-action-btn" disabled={!armed} onClick={CallDischarge}>
                    Discharge
                </button>
            </div>
            <div className="node-actions node-actions--bottom">
                <button className="node-action-btn" disabled={!armed} onClick={CallRun}>
                    Run
                </button>
                <button
                    className="node-action-btn node-action-btn--cancel"
                    disabled={!port}
                    onClick={CallCancel}
                >
                    Cancel
                </button>
            </div>

            {live?.warning && <p className="node-message node-message--error">{live.warning}</p>}
            {settingsError ? (
                <p className="node-message node-message--error">{settingsError}</p>
            ) : (
                message && <p className="node-message">{message}</p>
            )}
        </div>
    );
};

export default memo(ElectroporatorNode);
