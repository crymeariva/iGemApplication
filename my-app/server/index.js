const express = require("express");
const cors = require("cors");
// const i2c = require("i2c-bus");
// const { Gpio } = require("onoff");
const db = require("./database");
const { chat, listModels } = require("./llm");

const app = express();
const PORT = 5001;

const fs = require('fs');
const path = require('path');

app.use(cors());
app.use(express.json());

const CONTEXT_DIR = path.join(__dirname, 'context');

const { handleAgentMessage } = require('./agent/handleMessage');
const { getKeyStatus, saveKeys } = require('./agentKeys');

const AGENT_INSTRUCTIONS = fs.readFileSync(
  path.join(CONTEXT_DIR, 'INSTRUCTIONS.md'),
  'utf-8'
);

const MOSMAGE_CONTEXT = fs.readFileSync(
  path.join(CONTEXT_DIR, 'MOSMAGE.md'),
  'utf-8'
);

/**
 * uncomment this block when testing on Pi
 */
/**
// Open I2C bus (bus 1 on Raspberry Pi)
const bus = i2c.openSync(1);
const SLAVE_ADDRESS = 0x04;
const TCA_ADDRESS = 0x70;  // I2C multiplexer

// Open to change
// Define GPIO pins
// NOTE: It seems that Raspberry OS kernel addresses GPIO pins yet by another numbering scheme.
// cat /sys/kernel/debug/gpio
// these originally were 17,27,22 for pi3, Changes in PI will break here
// Current Pi (BCM 17/27/22): 529, 539, 534
// was 588, 598, 593 on Pi5
const pins = [
  new Gpio(529, "out"),
  new Gpio(539, "out"),
  new Gpio(534, "out"),
];

// Helper function: convert number to 3-bit array
function to3BitArray(num) {
  return [
    (num >> 2) & 1,
    (num >> 1) & 1,
    num & 1,
  ];
}

// Write bits to pins
function writeBits(bits) {
  bits.forEach((bit, i) => {
    pins[i].writeSync(bit);
  });
}

app.post("/api/instr", (req, res) => {
  const { axis, compInstr, board } = req.body;

  const direction = compInstr?.Direction?.toLowerCase();
  const distance = compInstr?.steps;
  const speed = String(compInstr?.Speed ?? 'S').toUpperCase();

  // Validate axis
  if (!["X", "Y", "Z", "A"].includes(axis)) {
    return res.status(400).json({ error: "Invalid axis" });
  }

  // Validate direction
  if (!["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "Invalid direction" });
  }

  // Validate board
  if (!Number.isInteger(board) || board < 0 || board > 7) {
    return res.status(400).json({ error: "Board must be integer 0–7" });
  }

  // Validate speed
  if (!['S', 'F'].includes(speed)) {
    return res.status(400).json({ error: "Speed must be F (Fast) or S (Slow)" });
  }

  const bits = to3BitArray(board);
  writeBits(bits);

  const message = `${axis} ${direction} ${distance} ${speed}`;

  // Convert string to byte array (same as Python ord())
  const bytes = Buffer.from(message, "utf-8");

  try {
    bus.writeByteSync(TCA_ADDRESS, 0x00, 1 << board); //Channel select


    bus.writeI2cBlockSync(
      SLAVE_ADDRESS,
      0x00, // command byte (same as Python)
      bytes.length,
      bytes
    );

    console.log("Sent:", message);
    res.json({ message: "Command sent to Arduino" });

  } catch (err) {
    console.error("I2C Error:", err);
    res.status(500).json({ error: "I2C failed" });
  }
});

// POST /api/cancel — Halts hardware instructions.
app.post("/api/cancel", (req, res) => {
  const { board } = req.body ?? {};

  const boards = Number.isInteger(board) && board >= 1 && board <= 4
  ? [board] // cancel this specific board
  : [1, 2, 3, 4]; // cancel all — skip failures on empty channels

  const cancelled = [];
  const failed = [];

  for (const b of boards) {
    try {
      const bits = to3BitArray(b);
      writeBits(bits);

      const bytes = Buffer.from("C", "utf-8");
      bus.writeByteSync(TCA_ADDRESS, 0x00, 1 << b); //Channel select
      bus.writeI2cBlockSync(
        SLAVE_ADDRESS,
        0x00, // command byte (same as Python)
        bytes.length,
        bytes
      );

      console.log("Sent: C to board", b);
      cancelled.push(b);
    } catch (err) {
      console.error(`I2C Error on board ${b}:`, err.message || err);
      failed.push(b);
    }
  }

  // Single-board cancel: still hard-fail if that board did not respond
  if (boards.length === 1 && cancelled.length === 0) {
    return res.status(500).json({ error: "I2C failed" });
  }

  // Cancel all: succeed if at least one board got C
  if (cancelled.length === 0) {
    return res.status(500).json({
      error: "I2C failed on all boards",
      failedBoards: failed,
    });
  }

  res.json({
    message:
      boards.length === 1
        ? `Cancel sent to board ${boards[0]}`
        : `Cancel sent to board(s) ${cancelled.join(", ")}`,
    cancelledBoards: cancelled,
    failedBoards: failed,
  });
});
*/

/**
 * POST /api/agent/chat
 * ai chat helper
 */
function getCanvasNodeCount(canvasContext) {
  if (!canvasContext) return 0;
  if (Number.isInteger(canvasContext.nodeCount)) return canvasContext.nodeCount;
  return Array.isArray(canvasContext.nodes) ? canvasContext.nodes.length : 0;
}

function isCanvasEmpty(canvasContext) {
  return getCanvasNodeCount(canvasContext) === 0;
}

function buildCanvasSystemMessage(canvasContext) {
  if (isCanvasEmpty(canvasContext)) {
    return {
      role: 'system',
      content:
        'The canvas is currently EMPTY: 0 nodes, 0 connections.\n' +
        'This overrides any earlier messages in this conversation that mention nodes on the canvas.\n' +
        'If the user asks what is on the canvas, answer that it is empty.',
    };
  }

  const summary = canvasContext.summary ?? '';

  return {
    role: 'system',
    content:
      `Current canvas state (authoritative — there are exactly ${canvasContext.nodeCount} node(s) on screen):\n\n` +
      `--- CANVAS INVENTORY ---\n${summary}\n--- END CANVAS INVENTORY ---`,
  };
}

function prepareMessagesForModel(messages, canvasContext) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  if (!isCanvasEmpty(canvasContext) || messages.length === 1) {
    return messages;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  return lastUserMessage ? [lastUserMessage] : messages;
}

/**
 * Build provider-safe chat messages.
 * Remote APIs (OpenRouter/Gemini) often ignore all but the first system message,
 * so instructions + MOSMAGE + canvas are merged into one system block, and the
 * live canvas is also attached to the latest user message for grounding.
 */
function buildAgentChatMessages({ instructions, mosmageContext, canvasContext, messages }) {
  const canvasText = buildCanvasSystemMessage(canvasContext).content;
  const systemContent = [
    instructions.trim(),
    '',
    'MOSMAGE reference:',
    mosmageContext.trim(),
    '',
    canvasText,
  ].join('\n');

  const conversation = prepareMessagesForModel(messages, canvasContext)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');

  if (conversation.length === 0) {
    return [{ role: 'system', content: systemContent }];
  }

  const lastIdx = conversation.length - 1;
  const grounded = conversation.map((message, index) => {
    if (index !== lastIdx || message.role !== 'user') return message;
    return {
      role: 'user',
      content:
        `${message.content}\n\n` +
        `[Live canvas ground truth — answer from this, not from earlier chat guesses]\n` +
        `${canvasText}`,
    };
  });

  return [{ role: 'system', content: systemContent }, ...grounded];
}

app.post('/api/agent/chat', async (req, res) => {
  const { messages, canvasContext } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] required' });
  }
  try {
    const result = await handleAgentMessage({
      messages,
      canvasContext,
      chatFn: async ({ messages, canvasContext }) => {
        const modelMessages = buildAgentChatMessages({
          instructions: AGENT_INSTRUCTIONS,
          mosmageContext: MOSMAGE_CONTEXT,
          canvasContext,
          messages,
        });
        const r = await chat({
          messages: modelMessages,
          allowFallback: true,
        });
        return {
          reply: r.content ?? '',
          modelId: r.modelId,
          modelLabel: r.modelLabel,
          usedFallback: Boolean(r.usedFallback),
        };
      },
    });
    res.json(result);
  } catch (err) {
    console.error('Agent chat error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Chat request failed',
    });
  }
});

/**
 * GET /api/agent/models
 * Model catalog / default label for the agent status display.
 */
app.get('/api/agent/models', (_req, res) => {
  res.json(listModels());
});

/**
 * GET /api/agent/keys
 * Status only, never returns the raw keys.
 */
app.get('/api/agent/keys', (_req, res) => {
  res.json(getKeyStatus());
});

/**
 * POST /api/agent/keys
 * Empty string clearing that key
 */
app.post('/api/agent/keys', (req, res) => {
  const { geminiApiKey, openRouterApiKey } = req.body ?? {};
  try {
    const status = saveKeys({ geminiApiKey, openRouterApiKey });
    res.json(status);
  } catch (err) {
    console.error('Save agent keys error:', err);
    res.status(500).json({ error: err.message || 'Failed to save keys' });
  }
});

/**
 * POST /api/cycles
 * Saves current canvas as a named cycle.
 */
app.post("/api/cycles", (req, res) => {
  const { name, nodes, edges } = req.body;

  if (!name || !Array.isArray(nodes)) {
    return res.status(400).json({ error: "Name and nodes[] required" });
  }

  const cycleStmt = db.prepare(`
    INSERT INTO cycles (name)
    VALUES (?)
  `);

  const result = cycleStmt.run(name);
  const cycleId = result.lastInsertRowid;

  const nodeStmt = db.prepare(`
    INSERT INTO nodes (cycleId, flowId, nodeType, positionX, positionY, jsonData)
    VALUES (@cycleId, @flowId, @nodeType, @positionX, @positionY, @jsonData)
  `);

  const edgeStmt = db.prepare(`
    INSERT INTO edges (cycleId, flowId, source, target)
    VALUES (@cycleId, @flowId, @source, @target)
  `);

  /**
   * Inserts many nodes and edges into the DB.
   * Either all nodes/edges succeed or none are inserted.
   */
  const insertMany = db.transaction((nodesIn, edgesIn) => {
    const safeNodes = Array.isArray(nodesIn) ? nodesIn : [];
    const safeEdges = Array.isArray(edgesIn) ? edgesIn : [];

    // insert nodes
    for (const node of safeNodes) {
      nodeStmt.run({
        cycleId,
        flowId: node.id,
        nodeType: node.type ?? null,
        positionX: node.position?.x ?? 0,
        positionY: node.position?.y ?? 0,
        jsonData: JSON.stringify(node.data ?? {}),
      });
    }

    // insert edges
    for (const edge of safeEdges) {
      edgeStmt.run({
        cycleId,
        flowId: edge.id,
        source: edge.source,
        target: edge.target,
      });
    }
  });

  insertMany(nodes, edges);

  res.status(201).json({ id: cycleId });
});

/**
 * GET /api/cycles
 * Retrieves all cycles from the DB.
 */
app.get("/api/cycles", (req, res) => {
  const stmt = db.prepare(`
    SELECT id, name FROM cycles
    ORDER BY name
  `);

  const rows = stmt.all();
  res.json(rows);
});

/**
 * GET /api/cycles/:id
 * Retrieves a single cycle from the DB.
 */
app.get("/api/cycles/:id", (req, res) => {
  const { id } = req.params;

  try {
    const nodesStmt = db.prepare(`SELECT * FROM nodes WHERE cycleId = ?`);
    const edgesStmt = db.prepare(`SELECT * FROM edges WHERE cycleId = ?`);

    const nodes = nodesStmt.all(id);
    const edges = edgesStmt.all(id);

    // Format nodes
    const formattedNodes = nodes.map(n => ({
      id: n.flowId,
      type: n.nodeType,
      position: { x: n.positionX, y: n.positionY },
      data: JSON.parse(n.jsonData)
    }));

    // Format edges
    const formattedEdges = edges.map(e => ({
      id: e.flowId,
      source: e.source,
      target: e.target
    }));

    res.json({ nodes: formattedNodes, edges: formattedEdges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load cycle" });
  }
});

/**
 * DELETE /api/cycles/:id
 * Deletes a cycle from the DB.
 */
app.delete("/api/cycles/:id", (req, res) => {
  const result = db.prepare(` DELETE FROM cycles WHERE id = ? `).run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  res.json({ message: "Cycle deleted" })
});

/**
 * PUT /api/cycles/:id
 * Updates a cycle in the DB after editing it.
 */
app.put("/api/cycles/:id", (req, res) => {
  const cycleId = Number(req.params.id);
  const { nodes, edges } = req.body;

  // validation
  if (!Number.isInteger(cycleId)) {
    return res.status(400).json({ error: "Invalid cycle ID" });
  }

  if (!Array.isArray(edges) || !Array.isArray(nodes)) {
    return res.status(400).json({ error: "nodes[] and edges[] required" });
  }

  // check cycle exists
  const exists = db.prepare(`SELECT id FROM cycles WHERE id = ?`).get(cycleId);
  if (!exists) {
    return res.status(404).json({ error: "Cycle not found" });
  }

  const deleteNodes = db.prepare(`DELETE FROM nodes WHERE cycleId = ?`);
  const deleteEdges = db.prepare(`DELETE FROM edges WHERE cycleId = ?`);

  const insertNodes = db.prepare(`
    INSERT INTO nodes (cycleId, flowId, nodeType, positionX, positionY, jsonData)
    VALUES (@cycleId, @flowId, @nodeType, @positionX, @positionY, @jsonData)
    `);

  const insertEdges = db.prepare(`
    INSERT INTO edges (cycleId, flowId, source, target)
    VALUES (@cycleId, @flowId, @source, @target)
    `);

  const overwrite = db.transaction((nodesIn, edgesIn) => {
    deleteNodes.run(cycleId);
    deleteEdges.run(cycleId);

    for (const node of nodesIn) {
      insertNodes.run({
        cycleId,
        flowId: node.id,
        nodeType: node.type ?? null,
        positionX: node.position?.x ?? 0,
        positionY: node.position?.y ?? 0,
        jsonData: JSON.stringify(node.data ?? {}),
      });
    }

    for (const edge of edgesIn) {
      insertEdges.run({
        cycleId,
        flowId: edge.id,
        source: edge.source,
        target: edge.target,
      });
    }

  });

  try {
    overwrite(nodes, edges);
    res.json({ id: cycleId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update cycle" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
