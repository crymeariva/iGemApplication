const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT_PATH = process.env.SPEC_SERIAL_PORT || 'COM3';
const LINE_RE = /Raw\s*=\s*(\d+).*Voltage\s*=\s*([\d.]+)/i;

let lastReading = null;
let lastError = null;

const samples = [];

const port = new SerialPort({
  path: PORT_PATH,
  baudRate: 115200,
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (line) => {
  const match = String(line).trim().match(LINE_RE);
  if (!match) return;
  lastReading = {
    raw: Number(match[1]),
    voltage: Number(match[2]),
    at: Date.now(),
  };

  samples.push(lastReading);
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 mins
  while (samples.length && samples[0].at < cutoff) { // stop array from growing n growing n growing
    samples.shift();
  }

  lastError = null;
});

port.on('open', () => {
  console.log(`Spectrometer serial open on ${PORT_PATH}`);
});

port.on('error', (err) => {
  lastError = err.message;
  console.error('Spectrometer serial error:', err.message);
});

function getReading() {
  if (!lastReading) {
    return {
      ok: false,
      error: lastError || `No reading yet from ${PORT_PATH}. Close Serial Monitor?`,
    };
  }
  return { ok: true, port: PORT_PATH, ...lastReading };
}

function waitUntilAvg({ metric, target, durationSec }) {
  const durationMs = durationSec * 1000;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const now = Date.now();
      const window = samples.filter((s) => s.at >= now - durationMs);

      if (window.length === 0) return;
      if (now - window[0].at < durationMs) return;

      const average = window.reduce((sum, s) => sum + s[metric], 0) / window.length;
      if (average >= target) {

        clearInterval(timer);
        resolve({
          ok: true,
          metric,
          target,
          durationSec,
          average,
          samples: window.length,
        });
      }
    }, 100);
  });
}
module.exports = { getReading, waitUntilAvg };
