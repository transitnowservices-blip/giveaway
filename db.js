'use strict';
/**
 * db.js — SQLite storage for the standalone giveaway app.
 * Uses node:sqlite (built into Node 22+). No native deps.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.GIVEAWAY_DB || path.join(__dirname, 'giveaway.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  month_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  drawn_at INTEGER
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(drawing_id, email)
);
CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id),
  name TEXT NOT NULL,
  detail TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id),
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  prize_id INTEGER REFERENCES prizes(id),
  drawn_at INTEGER NOT NULL
);
`);

const DEFAULT_PRIZES = [
  { name: '$500 Cash', detail: 'Paid via Cash App or Zelle' },
  { name: "Wealth Builder's Room \u2014 1 Month Free", detail: 'Full member access' },
  { name: 'TransitNow Complete \u2014 1 Month Free', detail: 'Full dispatch subscription' },
  { name: 'The Blueprint \u2014 Free Access', detail: 'Digital copy' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function now() { return Date.now(); }

function getOpenDrawing() {
  return db.prepare(`SELECT * FROM drawings WHERE status = 'open' ORDER BY id DESC LIMIT 1`).get() || null;
}

function getDrawing(id) {
  return db.prepare(`SELECT * FROM drawings WHERE id = ?`).get(id) || null;
}

function listDrawings() {
  return db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM entries e WHERE e.drawing_id = d.id) AS entry_count,
    (SELECT COUNT(*) FROM winners w WHERE w.drawing_id = d.id) AS winner_count
    FROM drawings d ORDER BY d.id DESC`).all();
}

function createDrawing(title, monthLabel) {
  if (getOpenDrawing()) throw new Error('A drawing is already open. Draw or close it before starting a new one.');
  const r = db.prepare(`INSERT INTO drawings (title, month_label, status, created_at) VALUES (?, ?, 'open', ?)`)
    .run(title.trim(), monthLabel.trim(), now());
  const id = Number(r.lastInsertRowid);
  const ins = db.prepare(`INSERT INTO prizes (drawing_id, name, detail, sort_order) VALUES (?, ?, ?, ?)`);
  DEFAULT_PRIZES.forEach((p, i) => ins.run(id, p.name, p.detail, i));
  return getDrawing(id);
}

function addEntry(drawingId, name, email, phone) {
  const d = getDrawing(drawingId);
  if (!d) throw new Error('Drawing not found.');
  if (d.status !== 'open') throw new Error('This drawing is closed.');
  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  phone = (phone || '').trim();
  if (name.length < 2) throw new Error('Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.');
  try {
    const r = db.prepare(`INSERT INTO entries (drawing_id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(drawingId, name, email, phone, now());
    return Number(r.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('This email is already entered in this drawing.');
    throw e;
  }
}

function listEntries(drawingId) {
  return db.prepare(`SELECT * FROM entries WHERE drawing_id = ? ORDER BY created_at ASC`).all(drawingId);
}

function listPrizes(drawingId) {
  return db.prepare(`SELECT * FROM prizes WHERE drawing_id = ? ORDER BY sort_order ASC, id ASC`).all(drawingId);
}

function addPrize(drawingId, name, detail) {
  name = (name || '').trim();
  if (!name) throw new Error('Prize name is required.');
  const max = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM prizes WHERE drawing_id = ?`).get(drawingId).m;
  db.prepare(`INSERT INTO prizes (drawing_id, name, detail, sort_order) VALUES (?, ?, ?, ?)`)
    .run(drawingId, name, (detail || '').trim(), max + 1);
}

function deletePrize(prizeId) {
  db.prepare(`DELETE FROM prizes WHERE id = ?`).run(prizeId);
}

/** Fisher-Yates shuffle using crypto randomness. */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function runDraw(drawingId, winnerCount) {
  const d = getDrawing(drawingId);
  if (!d) throw new Error('Drawing not found.');
  if (d.status !== 'open') throw new Error('This drawing was already drawn.');
  winnerCount = Math.floor(Number(winnerCount));
  if (!winnerCount || winnerCount < 1 || winnerCount > 25) throw new Error('Pick between 1 and 25 winners.');
  const entries = listEntries(drawingId);
  if (entries.length === 0) throw new Error('No entries yet.');
  if (entries.length < winnerCount) throw new Error(`Only ${entries.length} entries \u2014 not enough for ${winnerCount} winners.`);
  const prizes = listPrizes(drawingId);
  if (prizes.length === 0) throw new Error('Add at least one prize before drawing.');
  const picked = shuffle(entries).slice(0, winnerCount);
  const t = now();
  const ins = db.prepare(`INSERT INTO winners (drawing_id, entry_id, prize_id, drawn_at) VALUES (?, ?, ?, ?)`);
  const out = picked.map((e, i) => {
    const prize = prizes[i % prizes.length];
    const r = ins.run(drawingId, e.id, prize.id, t);
    return { id: Number(r.lastInsertRowid), entry: e, prize };
  });
  db.prepare(`UPDATE drawings SET status = 'closed', drawn_at = ? WHERE id = ?`).run(t, drawingId);
  return out;
}

function listWinners(drawingId) {
  return db.prepare(`
    SELECT w.id, w.drawn_at, e.name, e.email, e.phone, p.name AS prize_name, p.detail AS prize_detail
    FROM winners w
    JOIN entries e ON e.id = w.entry_id
    LEFT JOIN prizes p ON p.id = w.prize_id
    WHERE w.drawing_id = ? ORDER BY w.id ASC`).all(drawingId);
}

function close() { db.close(); }

module.exports = {
  getOpenDrawing, getDrawing, listDrawings, createDrawing,
  addEntry, listEntries, listPrizes, addPrize, deletePrize,
  runDraw, listWinners, close, DEFAULT_PRIZES,
};
