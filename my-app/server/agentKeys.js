/**
 * .env work
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');
// Each key becomes one KEY=value line in .env.
const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;

function checkKey(name, value) {
  if (!KEY_PATTERN.test(value)) {
    throw Object.assign(
      new Error(`${name} key can only contain letters, numbers, "-", "_" and "."`),
      { status: 400 }
    );
  }
}

function readEnvFile() {
    if (!fs.existsSync(ENV_PATH)) return {};
    const map = {};
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      map[key] = value;
    }
    return map;
  }
  function writeEnvFile(map) {
    const lines = Object.entries(map).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
  }
  function getKeyStatus() {
    const gemini = (process.env.GEMINI_API_KEY || '').trim();
    const openRouter = (process.env.OPENROUTER_API_KEY || '').trim();
    return {
      geminiConfigured: Boolean(gemini),
      openRouterConfigured: Boolean(openRouter),
    };
  }
  function saveKeys({ geminiApiKey, openRouterApiKey }) {
    const gemini = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : '';
    const openRouter = typeof openRouterApiKey === 'string' ? openRouterApiKey.trim() : '';
    if (gemini) checkKey('Gemini', gemini);
    if (openRouter) checkKey('OpenRouter', openRouter);

    const map = readEnvFile();
    if (typeof geminiApiKey === 'string') {
      const v = geminiApiKey.trim();
      if (v) {
        map.GEMINI_API_KEY = v;
        process.env.GEMINI_API_KEY = v;
      } else {
        delete map.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = '';
      }
    }
    if (typeof openRouterApiKey === 'string') {
      const v = openRouterApiKey.trim();
      if (v) {
        map.OPENROUTER_API_KEY = v;
        process.env.OPENROUTER_API_KEY = v;
      } else {
        delete map.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = '';
      }
    }
    writeEnvFile(map);
    return getKeyStatus();
  }
  module.exports = { getKeyStatus, saveKeys };