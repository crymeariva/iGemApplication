/**
 * Look at latest user message, picks a path, and then returns a typed result the client can understand
 */
const { classifyIntent } = require('./intent');
const { generateCycle } = require('./generateCycle');

async function handleAgentMessage({ messages, canvasContext, chatFn }) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = lastUser?.content ?? '';

  if (classifyIntent(text) === 'generate_cycle') {
    const generated = await generateCycle({ prompt: text });
    if (!generated.ok) {
      return {
        type: 'message',
        reply: `Couldn’t build that cycle: ${generated.error}`,
      };
    }

    const { cycle } = generated;
    return {
      type: 'cycle',
      cycle,
      reply: cycle.summary
        ? `Built the cycle on the canvas. ${cycle.summary}`
        : 'Built the cycle on the canvas.',
      modelId: generated.modelId,
      modelLabel: generated.modelLabel,
      usedFallback: Boolean(generated.usedFallback),
    };
  }

  const chatResult = await chatFn({ messages, canvasContext });
  return {
    type: 'message',
    reply: chatResult.reply,
    modelId: chatResult.modelId,
    modelLabel: chatResult.modelLabel,
    usedFallback: Boolean(chatResult.usedFallback),
  };
}

module.exports = { handleAgentMessage };
