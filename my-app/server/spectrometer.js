const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const DEFAULT_PORT = process.env.SPEC_SERIAL_PORT || 'COM3';
const LINE_RE = /Raw\s*=\s*(\d+).*Voltage\s*=\s*([\d.]+)/i;
const SAMPLE_KEEP_MS = 5 * 60 * 1000;

const readers = {};
const activeWaits = new Map();

function resolvePath(portPath) {
  return portPath || DEFAULT_PORT;
}

function ensureReader(portPath) {
  const path = resolvePath(portPath);
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

  serial.on('error', (err) => {
    reader.lastError = err.message;
    console.error('Spectrometer serial error:', err.message);
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
  const reader = ensureReader(port);
  const durationMs = durationSec * 1000;
  const samples = reader.samples;
  const path = reader.path;

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
    const path = resolvePath(portPath);
    const wait = activeWaits.get(path);
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
