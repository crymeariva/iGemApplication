const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const LINE_RE = /Raw\s*=\s*(\d+).*Voltage\s*=\s*([\d.]+)/i;
const SAMPLE_KEEP_MS = 5 * 60 * 1000;

const readers = {};
const activeWaits = new Map();

function noPortError() {
  return Object.assign(new Error('No spectrometer port selected'), { noPort: true });
}

function ensureReader(path) {
  if (readers[path]) return readers[path];

  const serial = new SerialPort({ path, baudRate: 115200 });
  const reader = {
    path,
    lastReading: null,
    lastError: null,
    samples: [],
  };

  const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', (line) => {
    const match = String(line).trim().match(LINE_RE);
    if (!match) return;
    reader.lastReading = {
      raw: Number(match[1]),
      voltage: Number(match[2]),
      at: Date.now(),
    };
    reader.samples.push(reader.lastReading);
    const cutoff = Date.now() - SAMPLE_KEEP_MS;
    while (reader.samples.length && reader.samples[0].at < cutoff) {
      reader.samples.shift();
    }
    reader.lastError = null;
  });

  serial.on('open', () => {
    console.log(`Spectrometer serial open on ${path}`);
  });

  // Drop dead readers so the next request reopens the port (unplug, failed open).
  const forget = () => {
    if (readers[path] === reader) delete readers[path];
  };

  serial.on('error', (err) => {
    reader.lastError = err.message;
    console.error(`Spectrometer serial error on ${path}:`, err.message);
    if (!serial.isOpen) forget();
  });

  serial.on('close', () => {
    console.log(`Spectrometer serial closed on ${path}`);
    forget();
  });

  readers[path] = reader;
  return reader;
}

async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    label: p.friendlyName || p.path,
  }));
}

function getReading(portPath) {
  if (!portPath) return { ok: false, error: 'Select a port' };
  const reader = ensureReader(portPath);
  if (!reader.lastReading) {
    return {
      ok: false,
      error:
        reader.lastError ||
        `No reading yet from ${reader.path}. Close Serial Monitor?`,
    };
  }
  return { ok: true, port: reader.path, ...reader.lastReading };
}

function waitUntilAvg({ port, metric, target, durationSec }) {
  if (!port) return Promise.reject(noPortError());
  const path = port;
  ensureReader(path);
  const durationMs = durationSec * 1000;

  if (activeWaits.has(path)) {
    return Promise.reject(
      Object.assign(new Error(`A spectrometer wait is already running on ${path}`), {
        busy: true,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      clearInterval(timer);
      activeWaits.delete(path);
      fn(value);
    };

    const timer = setInterval(() => {
      const now = Date.now();
      // Re-fetch each tick: the reader is replaced if the port reconnects.
      const samples = ensureReader(path).samples;
      const window = samples.filter((s) => s.at >= now - durationMs);

      if (window.length === 0) return;
      if (now - window[0].at < durationMs) return;

      const average =
        window.reduce((sum, s) => sum + s[metric], 0) / window.length;
      if (average >= target) {
        finish(resolve, {
          ok: true,
          port: path,
          metric,
          target,
          durationSec,
          average,
          samples: window.length,
        });
      }
    }, 100);

    activeWaits.set(path, {
      cancel() {
        finish(
          reject,
          Object.assign(new Error('Spectrometer wait cancelled'), {
            cancelled: true,
          })
        );
      },
    });
  });
}

function cancelWait(portPath) {
  if (portPath) {
    const wait = activeWaits.get(portPath);
    if (!wait) return false;
    wait.cancel();
    return true;
  }

  const waits = [...activeWaits.values()];
  for (const wait of waits) {
    wait.cancel();
  }
  return waits.length > 0;
}

module.exports = { listPorts, getReading, waitUntilAvg, cancelWait };
