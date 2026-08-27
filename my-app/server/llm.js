const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

const getOpenRouterKey = () => process.env.OPENROUTER_API_KEY ?? '';
const getGeminiKey = () => process.env.GEMINI_API_KEY ?? '';

const AGENT_MODELS = [
  { id: 'gemini:gemini-3.1-flash-lite', provider: 'gemini', model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (Free Tier)' },
  { id: 'gemini:gemini-3-flash-preview', provider: 'gemini', model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (Free Tier)' },
  { id: 'openrouter:openrouter/free', provider: 'openrouter', model: 'openrouter/free', label: 'OpenRouter Free (Carousel)' },
  { id: 'ollama:qwen2.5:1.5b', provider: 'ollama', model: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B (Local)' },
];

/** First in batting order */
const DEFAULT_MODEL_ID = process.env.AGENT_MODEL_ID ?? 'gemini:gemini-3.1-flash-lite';

/** Local last resort when remote models fail. */
const FALLBACK_MODEL_ID = process.env.AGENT_FALLBACK_MODEL_ID ?? 'ollama:qwen2.5:1.5b';

const isOpenRouterConfigured = () => Boolean(getOpenRouterKey().trim());
const isGeminiConfigured = () => Boolean(getGeminiKey().trim());
const findModel = (modelId) => AGENT_MODELS.find((m) => m.id === modelId) ?? null;

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function providerError(prefix, data, status) {
  const err = Array.isArray(data) ? data[0]?.error : data?.error;
  const raw = err?.metadata?.raw || err?.message;
  if (!raw) return `${prefix}: HTTP ${status}`;
  if (status === 429) return `${prefix}: rate limited — ${raw}`;
  if (status === 404) return `${prefix}: model not available — ${raw}`;
  return `${prefix}: ${raw}`;
}

function resolveModelSelection(modelId) {
  const selected = findModel(modelId) ?? findModel(DEFAULT_MODEL_ID) ?? AGENT_MODELS[0];
  if (!selected) throw httpError('No agent models configured.', 500);

  if (selected.provider === 'openrouter') {
    if (!selected.model.endsWith(':free') && selected.model !== 'openrouter/free') {
      throw httpError(`Refusing non-free OpenRouter model: ${selected.model}`, 400);
    }
    if (!isOpenRouterConfigured()) {
      throw httpError('OpenRouter API key not set. Add OPENROUTER_API_KEY to my-app/server/.env', 503);
    }
  }
  if (selected.provider === 'gemini' && !isGeminiConfigured()) {
    throw httpError('Gemini API key not set. Add GEMINI_API_KEY to my-app/server/.env', 503);
  }
  return selected;
}

function listModels() {
  return {
    models: AGENT_MODELS.map(({ id, provider, label }) => ({
      id,
      provider,
      label,
      available:
        provider === 'ollama' ||
        (provider === 'openrouter' && isOpenRouterConfigured()) ||
        (provider === 'gemini' && isGeminiConfigured()),
    })),
    defaultModelId: findModel(DEFAULT_MODEL_ID)?.id ?? AGENT_MODELS[0]?.id,
    fallbackModelId: findModel(FALLBACK_MODEL_ID)?.id ?? null,
    openRouterConfigured: isOpenRouterConfigured(),
    geminiConfigured: isGeminiConfigured(),
  };
}

async function chatOllama({ model, messages, json, temperature }) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        options: { temperature },
        messages,
      }),
    });
  } catch {
    throw httpError('Could not reach Ollama. Is it running, or switch to a remote model?', 503);
  }
  if (!res.ok) throw httpError('Ollama request failed', res.status);
  const data = await res.json();
  return { content: data.message?.content ?? '', provider: 'ollama', model };
}

/** OpenAI-compatible chat (OpenRouter + Gemini). */
async function chatOpenAICompat({
  url,
  apiKey,
  provider,
  model,
  messages,
  temperature,
  json = false,
  extraHeaders = {},
}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch {
    throw httpError(`${provider} request failed`, 502);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw httpError(providerError(provider, data, res.status), res.status);

  const content = data?.choices?.[0]?.message?.content ?? '';
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    provider,
    model: data?.model ?? model,
  };
}

async function chatOnce(selection, { messages, json, temperature }) {
  if (selection.provider === 'ollama') {
    return chatOllama({ model: selection.model, messages, json, temperature });
  }
  if (selection.provider === 'openrouter') {
    return chatOpenAICompat({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: getOpenRouterKey(),
      provider: 'OpenRouter',
      model: selection.model,
      messages,
      temperature,
      json,
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER ?? 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'MOSMAGE',
      },
    });
  }
  if (selection.provider === 'gemini') {
    return chatOpenAICompat({
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: getGeminiKey(),
      provider: 'Gemini',
      model: selection.model,
      messages,
      temperature,
      json,
    });
  }
  throw httpError(`Unknown provider: ${selection.provider}`, 400);
}

function isModelConfigured(entry) {
  if (!entry) return false;
  if (entry.provider === 'ollama') return true;
  if (entry.provider === 'openrouter') return isOpenRouterConfigured();
  if (entry.provider === 'gemini') return isGeminiConfigured();
  return false;
}

/**
 * Fixed order: Flash-Lite → Gemini 3 → OpenRouter → Ollama.
 * Skips providers that are not configured.
 */
function buildTryQueue() {
  const queue = [];
  const seen = new Set();

  for (const entry of AGENT_MODELS) {
    if (!entry || seen.has(entry.id) || !isModelConfigured(entry)) continue;
    seen.add(entry.id);
    queue.push(entry);
  }
  return queue;
}

/** Chat with fixed fallback order. modelId is ignored when allowFallback is true. */
async function chat({
  messages,
  json = false,
  temperature = 0.1,
  allowFallback = true,
}) {
  const queue = allowFallback
    ? buildTryQueue()
    : [findModel(DEFAULT_MODEL_ID)].filter(Boolean);
  let lastErr;

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    try {
      const result = await chatOnce(candidate, { messages, json, temperature });
      if (json) {
        const extracted = extractJsonObject(result.content);
        if (!extracted) {
          throw httpError(`${candidate.id} did not return valid JSON`, 502);
        }
        return {
          ...result,
          content: extracted,
          modelId: candidate.id,
          modelLabel: candidate.label,
          usedFallback: i > 0,
        };
      }
      return {
        ...result,
        modelId: candidate.id,
        modelLabel: candidate.label,
        usedFallback: i > 0,
      };
    } catch (err) {
      console.warn(`[llm] ${candidate.id} failed:`, err.message);
      lastErr = err;
    }
  }

  throw lastErr || httpError('All configured models failed.', 503);
}

/** Pull a JSON object out of model text (raw or markdown-fenced). */
function extractJsonObject(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? trimmed : null;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (typeof parsed === 'object' && parsed !== null) return fenced[1].trim();
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (typeof parsed === 'object' && parsed !== null) return slice;
    } catch {
      return null;
    }
  }

  return null;
}

module.exports = {
  chat,
  listModels,
  findModel,
  resolveModelSelection,
  isOpenRouterConfigured,
  isGeminiConfigured,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
};
