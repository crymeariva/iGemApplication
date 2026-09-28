const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// SQLite file location: server/data/app.db
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'app.db');

// folder check
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enforce foreign keys. Need this for ON DELETE CASCADE.
db.pragma('foreign_keys = ON');

// Schema overview:
// - cycles: one row per saved, user-named canvas
// - nodes: node state for each cycle (position + jsonData payload)
// - edges: connections for each cycle (jsonData for delay settings)
// ON DELETE CASCADE removes related nodes/edges when a cycle is deleted.
db.exec(`
    CREATE TABLE IF NOT EXISTS cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycleId INTEGER NOT NULL,
    flowId TEXT NOT NULL,
    nodeType TEXT,
    positionX REAL NOT NULL,
    positionY REAL NOT NULL,
    jsonData TEXT NOT NULL,
    FOREIGN KEY (cycleId) REFERENCES cycles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycleId INTEGER NOT NULL,
    flowId TEXT NOT NULL,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    jsonData TEXT,
    FOREIGN KEY (cycleId) REFERENCES cycles(id) ON DELETE CASCADE
    );
`);

// This is for the Pi's current database, should update it properly.
const edgeCols = db.prepare(`PRAGMA table_info(edges)`).all();
if (!edgeCols.some((c) => c.name === 'jsonData')) {
    db.exec(`ALTER TABLE edges ADD COLUMN jsonData TEXT`);
}

console.log("Database made successfully");

module.exports = db;
