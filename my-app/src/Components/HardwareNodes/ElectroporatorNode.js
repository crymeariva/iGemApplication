import { memo, useCallback, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { API_BASE } from '../../api/config';
import NodeHeader from './NodeHeader';
import './HardwareNode.css';

const API = `${API_BASE}/electro`;

const MAX_VOLTAGE = 1400;
const MIN_DISCHARGE_VOLT = 12;
const BURST_MIN_MS = 10;
const BURST_MAX_MS = 50;
const DEFAULT_CHARGE_MIN = 10;
const ARM_TIMEOUT_MS = 60 * 1000;

const filled = (v) => v !== '' && v !== null && v !== undefined;
const num = (v) => (filled(v) ? Number(v) : NaN);

const isComplete = (s) =>
    (s.chargeMode === 'volt' ? filled(s.chargeV) : filled(s.chargeMin ?? DEFAULT_CHARGE_MIN)) &&
    filled(s.minV) &&
    ((s.dischargeMode || 'exp') === 'exp' || filled(s.burstMs));

const ElectroporatorNode = ({ data, isConnectable, selected }) => {
    const [port, setPort] = useState(data.settings?.port || '');
    const [chargeMode, setChargeMode] = useState(data.settings?.chargeMode || 'time');
    const [chargeMin, setChargeMin] = useState(data.settings?.chargeMin ?? DEFAULT_CHARGE_MIN);
    const [chargeV, setChargeV] = useState(data.settings?.chargeV ?? '');
    const [dischargeMode, setDischargeMode] = useState(data.settings?.dischargeMode || 'exp');
    const [minV, setMinV] = useState(data.settings?.minV ?? '');
    const [burstMs, setBurstMs] = useState(data.settings?.burstMs ?? '');
    const [ports, setPorts] = useState([]);
    const [live, setLive] = useState(null);
    const [message, setMessage] = useState('');
    const [armed, setArmed] = useState(false);
    const [expanded, setExpanded] = useState(() => !isComplete(data.settings || {}));

    useEffect(() => {
        const s = data.settings || {};
        setPort(s.port ?? '');
        setChargeMode(s.chargeMode || 'time');
        setChargeMin(s.chargeMin ?? DEFAULT_CHARGE_MIN);
        setChargeV(s.chargeV ?? '');
        setDischargeMode(s.dischargeMode || 'exp');
        setMinV(s.minV ?? '');
        setBurstMs(s.burstMs ?? '');
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

    // Expected shape: { ok, ready, powered, phase, voltage, error }
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

    // Empty fields block arming but don't show an error; only bad values do.
    const chargeError = () => {
        if (chargeMode === 'time') {
            if (filled(chargeMin) && !(num(chargeMin) > 0)) return 'Charge time must be above 0';
        } else if (filled(chargeV)) {
            const v = num(chargeV);
            if (!(v > 0 && v <= MAX_VOLTAGE)) return `Charge voltage must be 1–${MAX_VOLTAGE} V`;
        }
        return '';
    };

    const dischargeError = () => {
        const v = num(minV);
        if (filled(minV) && !(v >= MIN_DISCHARGE_VOLT && v <= MAX_VOLTAGE)) {
            return `Min voltage must be ${MIN_DISCHARGE_VOLT}–${MAX_VOLTAGE} V`;
        }
        if (dischargeMode === 'square') {
            const b = num(burstMs);
            if (filled(burstMs) && !(b >= BURST_MIN_MS && b <= BURST_MAX_MS)) {
                return `Burst must be ${BURST_MIN_MS}–${BURST_MAX_MS} ms`;
            }
        }
        return '';
    };

    const complete = isComplete({ chargeMode, chargeMin, chargeV, dischargeMode, minV, burstMs });
    const settingsError = chargeError() || dischargeError();

    const connected = live?.ok && live?.ready;
    const powered = connected && live?.powered;
    const busy = connected && live?.phase && live.phase !== 'idle';
    const canArm = connected && !busy && !settingsError && complete;

    const chargeBody = () =>
        chargeMode === 'time'
            ? { mode: 'time', chargeMs: Math.round(num(chargeMin) * 60 * 1000) }
            : { mode: 'volt', chargeV: num(chargeV) };

    const dischargeBody = () =>
        dischargeMode === 'exp'
            ? { mode: 'exp', minV: num(minV) }
            : { mode: 'square', minV: num(minV), burstMs: num(burstMs) };

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
        return post('run', { charge: chargeBody(), discharge: dischargeBody() });
    };

    const CallCharge = () => {
        setArmed(false);
        return post('charge', chargeBody());
    };

    const CallDischarge = () => {
        setArmed(false);
        return post('discharge', dischargeBody());
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

                            {dischargeMode === 'square' && (
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
                                    <p className="setting-note">
                                        Recharges to max ({MAX_VOLTAGE} V) after pulsing.
                                    </p>
                                </>
                            )}
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

            {settingsError ? (
                <p className="node-message node-message--error">{settingsError}</p>
            ) : (
                message && <p className="node-message">{message}</p>
            )}
        </div>
    );
};

export default memo(ElectroporatorNode);
