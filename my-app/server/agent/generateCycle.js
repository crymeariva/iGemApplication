const fs = require('fs');
const path = require('path');
const { chat } = require('../llm');
const { validateCycle } = require('./validateCycle');

const GENERATE_CYCLE_MD = fs.readFileSync(
  path.join(__dirname, '..', 'context', 'GENERATE_CYCLE.md'),
  'utf8'
);

async function generateCycle({ prompt }) {
  const messages = [
    {
      role: 'system',
      content: [
        'You convert laboratory / natural language instructions into a MOSMAGE cycle graph.',
        'Reply with ONLY a single JSON object. No markdown fences, no commentary.',
        'Shape: { "summary": string, "nodes": [...], "edges": [...] }',
        'Use ONLY listed node types. Only fill settings the user stated.',
        'Each node needs string id and type. data.label must be the classic hardware name.',
        '',
        GENERATE_CYCLE_MD,
      ].join('\n'),
    },
    { role: 'user', content: String(prompt).trim() },
  ];

  let result;
  try {
    result = await chat({
      messages,
      json: true,
      temperature: 0.1,
      allowFallback: true,
    });
  } catch (err) {
    return { ok: false, error: err.message || 'All models failed to build JSON' };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    return { ok: false, error: 'Model did not return valid JSON' };
  }

  const validated = validateCycle(parsed);
  if (!validated.ok) return validated;

  return {
    ok: true,
    cycle: validated.cycle,
    modelId: result.modelId,
    modelLabel: result.modelLabel,
    usedFallback: Boolean(result.usedFallback),
  };
}

module.exports = { generateCycle };
