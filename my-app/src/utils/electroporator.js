/**
 * Electroporator settings: defaults, validation, and the request bodies sent to /api/electro.
 * Shared by the node and the cycle runner so both send identical commands.
 * Limits mirror the firmware (Electroporator.ino), which rejects anything outside them.
 */

export const MAX_VOLTAGE = 1400;
export const MIN_DISCHARGE_VOLT = 12;
export const BURST_MIN_MS = 10;
export const BURST_MAX_MS = 50;
export const TIME_ON_MIN_S = 1;
export const TIME_ON_MAX_S = 600;
export const DEFAULT_CHARGE_MIN = 10;

const filled = (v) => v !== '' && v !== null && v !== undefined;
const num = (v) => (filled(v) ? Number(v) : NaN);
const inRange = (v, min, max) => v >= min && v <= max;

export function withDefaults(settings = {}) {
  return {
    chargeMode: settings.chargeMode || 'time',
    chargeMin: settings.chargeMin ?? DEFAULT_CHARGE_MIN,
    chargeV: settings.chargeV ?? '',
    dischargeMode: settings.dischargeMode || 'exp',
    minV: settings.minV ?? '',
    burstMs: settings.burstMs ?? '',
    timeOnSec: settings.timeOnSec ?? '',
  };
}

/** True when every field the selected modes need has a value. */
export function isComplete(settings) {
  const s = withDefaults(settings);
  const chargeSet = s.chargeMode === 'volt' ? filled(s.chargeV) : filled(s.chargeMin);
  const dischargeSet =
    s.dischargeMode === 'square' ? filled(s.burstMs) && filled(s.timeOnSec) : filled(s.minV);
  return chargeSet && dischargeSet;
}

/** First out-of-range value as a message, or ''. Empty fields are left to isComplete. */
export function settingsError(settings) {
  const s = withDefaults(settings);

  if (s.chargeMode === 'volt') {
    if (filled(s.chargeV) && !inRange(num(s.chargeV), 1, MAX_VOLTAGE)) {
      return `Charge voltage must be 1–${MAX_VOLTAGE} V`;
    }
  } else if (filled(s.chargeMin) && !(num(s.chargeMin) > 0)) {
    return 'Charge time must be above 0';
  }

  if (s.dischargeMode === 'square') {
    if (filled(s.burstMs) && !inRange(num(s.burstMs), BURST_MIN_MS, BURST_MAX_MS)) {
      return `Burst must be ${BURST_MIN_MS}–${BURST_MAX_MS} ms`;
    }
    if (filled(s.timeOnSec) && !inRange(num(s.timeOnSec), TIME_ON_MIN_S, TIME_ON_MAX_S)) {
      return `Time on must be ${TIME_ON_MIN_S}–${TIME_ON_MAX_S} s`;
    }
  } else if (filled(s.minV) && !inRange(num(s.minV), MIN_DISCHARGE_VOLT, MAX_VOLTAGE)) {
    return `Min voltage must be ${MIN_DISCHARGE_VOLT}–${MAX_VOLTAGE} V`;
  }

  return '';
}

export function chargeBody(settings) {
  const s = withDefaults(settings);
  return s.chargeMode === 'volt'
    ? { mode: 'volt', chargeV: num(s.chargeV) }
    : { mode: 'time', chargeMs: Math.round(num(s.chargeMin) * 60 * 1000) };
}

export function dischargeBody(settings) {
  const s = withDefaults(settings);
  return s.dischargeMode === 'square'
    ? { mode: 'square', burstMs: num(s.burstMs), timeOnSec: num(s.timeOnSec) }
    : { mode: 'exp', minV: num(s.minV) };
}

/** One-line summary for the Send All confirmation. */
export function describeRun(settings) {
  const s = withDefaults(settings);
  const charge = s.chargeMode === 'volt' ? `charge to ${s.chargeV} V` : `charge ${s.chargeMin} min`;
  const discharge =
    s.dischargeMode === 'square'
      ? `square wave ${s.burstMs} ms bursts for ${s.timeOnSec} s`
      : `exponential down to ${s.minV} V`;
  return `${charge}, ${discharge}, then drain`;
}
