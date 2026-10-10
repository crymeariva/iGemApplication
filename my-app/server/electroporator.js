const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const COMMAND_TIMEOUT_MS = 2000;
// Ceiling for one charge or discharge phase; the firmware should also enforce its own.
const PHASE_TIMEOUT_MS = 30 * 60 * 1000;
const DONE_LINES = ['CHARGE_DONE', 'DISCHARGE_DONE', 'DISCHARGE_DONE_AUTOCHARGE'];

const boards = {};

function badRequest(message) {
    return Object.assign(new Error(message), { badRequest: true });
}

function ensureBoard(path) {
    if (boards[path]) return boards[path];

    const serial = new SerialPort({ path, baudRate: 115200 });

    const board = {
        path,
        serial,
        ready: false,
        powered: false,
        phase: 'idle',
        voltage: null,
        lastError: null,
        pending: null,
        queue: Promise.resolve(),
        waiters: new Set(),
    };

    const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => handleLine(board, String(line).trim()));

    serial.on('open', () => {
        console.log(`Electroporator serial open on ${path}`);
    });

    const forget = () => {
        board.ready = false;
        failWaiters(board, new Error(`Electroporator on ${path} disconnected`));
        if (boards[path] === board) delete boards[path];
    };

    // Without this listener a serial error (unplugged, wrong port) crashes the whole server.
    serial.on('error', (err) => {
        board.lastError = err.message;
        console.error(`Electroporator serial error on ${path}:`, err.message);
        if (!serial.isOpen) forget();
    });

    serial.on('close', () => {
        console.log(`Electroporator closed on ${path}`);
        forget();
    });

    boards[path] = board;
    return board;
}

/**
 * Every line from the Arduino comes through here.
 * OK/ERR answer the pending command; everything else is a status update.
 */
function handleLine(board, line) {
    if (!line) return;

    if (line === 'READY') {
        // Opening the port resets the Nano, so READY means a fresh, idle board.
        board.ready = true;
        board.powered = false;
        board.phase = 'idle';
        board.lastError = null;
        return;
    }

    if (line === 'OK' || line === 'ERR') {
        const pending = board.pending;
        if (!pending) return;
        board.pending = null;
        clearTimeout(pending.timer);
        if (line === 'OK') pending.resolve();
        else pending.reject(new Error(`Electroporator rejected "${pending.command}"`));
        return;
    }

    if (line.startsWith('SAMPLE ')) {
        board.voltage = Number(line.slice('SAMPLE '.length));
        return;
    }

    if (DONE_LINES.includes(line)) {
        console.log(`Electroporator ${board.path}: ${line}`);
        // Square-wave discharge hands straight over to charging on the board.
        board.phase = line === 'DISCHARGE_DONE_AUTOCHARGE' ? 'charging' : 'idle';
        for (const waiter of [...board.waiters]) waiter.onLine(line);
        // Relay is only on while a phase is active.
        if (board.phase === 'idle') powerOff(board);
    }
}

/**
 * Sends one command and resolves on OK / rejects on ERR or timeout.
 * Replies carry no id, so commands are queued and sent strictly one at a time.
 */
function send(board, command) {
    const run = () =>
        new Promise((resolve, reject) => {
            if (!board.ready) {
                reject(new Error('Electroporator not ready (waiting for READY)'));
                return;
            }
            const timer = setTimeout(() => {
                board.pending = null;
                reject(new Error(`No reply to "${command}"`));
            }, COMMAND_TIMEOUT_MS);
            board.pending = { command, resolve, reject, timer };
            board.serial.write(`${command}\n`);
        });

    const result = board.queue.then(run, run);
    board.queue = result.catch(() => {});
    return result;
}

async function powerOn(board) {
    await send(board, 'POWER 1');
    board.powered = true;
}

function powerOff(board) {
    board.powered = false;
    // A board that isn't ready has just reset, which already leaves the relay off.
    if (!board.ready) return Promise.resolve();
    return send(board, 'POWER 0').catch((err) => {
        console.error(`Electroporator power off failed on ${board.path}:`, err.message);
    });
}

/**
 * Resolves when the board prints one of `lines`.
 * Rejects on timeout, stop(), or disconnect (via failWaiters).
 */
function waitForDone(board, lines) {
    return new Promise((resolve, reject) => {
        const waiter = {
            onLine(line) {
                if (!lines.includes(line)) return;
                cleanup();
                resolve(line);
            },
            fail(err) {
                cleanup();
                reject(err);
            },
        };
        const timer = setTimeout(
            () => waiter.fail(Object.assign(new Error('Electroporator phase timed out'), { timedOut: true })),
            PHASE_TIMEOUT_MS
        );
        const cleanup = () => {
            clearTimeout(timer);
            board.waiters.delete(waiter);
        };
        board.waiters.add(waiter);
    });
}

function failWaiters(board, err) {
    for (const waiter of [...board.waiters]) waiter.fail(err);
}

/* Settings from the node -> firmware command text */

function chargeCommand({ mode, chargeMs, chargeV } = {}) {
    if (mode === 'volt') {
        const v = Number(chargeV);
        if (!(v > 0)) throw badRequest('chargeV must be a positive number');
        return `CHARGE_VOLT ${v}`;
    }
    const ms = Math.round(Number(chargeMs));
    if (!(ms > 0)) throw badRequest('chargeMs must be a positive number');
    return `CHARGE_TIME ${ms}`;
}

function dischargeCommand({ mode, minV, burstMs } = {}) {
    const v = Number(minV);
    if (!(v > 0)) throw badRequest('minV must be a positive number');
    if (mode === 'square') {
        const ms = Math.round(Number(burstMs));
        if (!(ms > 0)) throw badRequest('burstMs must be a positive number');
        return `DISCHARGE_SQUARE ${ms} ${v}`;
    }
    return `DISCHARGE_EXP ${v}`;
}

/* Public API used by the routes */

function getStatus(path) {
    if (!path) return { ok: false, error: 'Select a port' };
    const board = ensureBoard(path);
    return {
        ok: !board.lastError,
        error: board.lastError,
        ready: board.ready,
        powered: board.powered,
        phase: board.phase,
        voltage: board.voltage,
    };
}

async function startPhase(board, command, phase) {
    if (board.phase !== 'idle') throw new Error(`Electroporator is busy (${board.phase})`);
    try {
        await powerOn(board);
        await send(board, command);
        board.phase = phase;
    } catch (err) {
        await powerOff(board);
        throw err;
    }
}

async function charge(path, settings) {
    const command = chargeCommand(settings);
    await startPhase(ensureBoard(path), command, 'charging');
}

async function discharge(path, settings) {
    const command = dischargeCommand(settings);
    await startPhase(ensureBoard(path), command, 'discharging');
}

/**
 * Full sequence: charge, wait for CHARGE_DONE, discharge, wait for the discharge to finish.
 * Any failure (error, timeout, stop, disconnect) shuts everything off.
 */
async function run(path, { charge: chargeSettings, discharge: dischargeSettings } = {}) {
    // Build both commands first so bad settings fail before anything switches on.
    const chargeCmd = chargeCommand(chargeSettings);
    const dischargeCmd = dischargeCommand(dischargeSettings);
    const board = ensureBoard(path);
    if (board.phase !== 'idle') throw new Error(`Electroporator is busy (${board.phase})`);

    try {
        await startPhase(board, chargeCmd, 'charging');
        await waitForDone(board, ['CHARGE_DONE']);
        await startPhase(board, dischargeCmd, 'discharging');
        const done = await waitForDone(board, ['DISCHARGE_DONE', 'DISCHARGE_DONE_AUTOCHARGE']);
        return done === 'DISCHARGE_DONE_AUTOCHARGE'
            ? 'Discharge done, recharging'
            : 'Run complete';
    } catch (err) {
        // A cancelled run was ended by stop(), which already shut everything off.
        if (!err.cancelled) await stop(path);
        throw err;
    }
}

/**
 * Stops one board, or every open board when no path is given.
 */
async function stop(path) {
    const targets = path ? [boards[path]].filter(Boolean) : Object.values(boards);

    for (const board of targets) {
        failWaiters(board, Object.assign(new Error('Electroporator stopped'), { cancelled: true }));
        board.phase = 'idle';
        if (!board.ready) continue;
        await send(board, 'STOP').catch(() => {});
        await powerOff(board);
    }

    return targets.length > 0;
}

module.exports = { getStatus, charge, discharge, run, stop };
