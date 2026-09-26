'use strict';
/** Smoke tests for the giveaway draw engine. Run: npm test */
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.GIVEAWAY_DB = ':memory:';
const db = require('./db');

test('create drawing seeds default prizes', () => {
  const d = db.createDrawing('Test Giveaway', 'Testober 2026');
  assert.equal(d.status, 'open');
  assert.equal(db.listPrizes(d.id).length, 4);
});

test('cannot open a second drawing while one is open', () => {
  assert.throws(() => db.createDrawing('Another', 'Nov 2026'), /already open/);
});

test('entries validate and dedupe', () => {
  const d = db.getOpenDrawing();
  db.addEntry(d.id, 'Jane Doe', 'jane@example.com', '414-555-0100');
  assert.throws(() => db.addEntry(d.id, 'Jane Doe', 'JANE@example.com', ''), /already entered/);
  assert.throws(() => db.addEntry(d.id, 'Valid Name', 'not-an-email', ''), /valid email/);
  assert.throws(() => db.addEntry(d.id, 'J', 'j2@example.com', ''), /name/);
});

test('draw picks unique random winners and assigns prizes in order', () => {
  const d = db.getOpenDrawing();
  const names = ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six'];
  names.forEach((n, i) => db.addEntry(d.id, n, `p${i}@example.com`, ''));
  // 1 existing (Jane) + 6 = 7 entries
  const winners = db.runDraw(d.id, 5);
  assert.equal(winners.length, 5);
  const entryIds = winners.map(w => w.entry.id);
  assert.equal(new Set(entryIds).size, 5, 'winners must be unique');
  const prizes = db.listPrizes(d.id).map(p => p.name);
  winners.forEach((w, i) => assert.equal(w.prize.name, prizes[i % prizes.length]));
  assert.equal(db.getDrawing(d.id).status, 'closed');
});

test('cannot draw twice; new drawing starts fresh', () => {
  const d = db.listDrawings()[0];
  assert.throws(() => db.runDraw(d.id, 2), /already drawn/);
  const d2 = db.createDrawing('Second', 'November 2026');
  assert.equal(db.listEntries(d2.id).length, 0, 'new drawing has fresh entry pool');
});

test('draw refuses when winners exceed entries', () => {
  const d = db.getOpenDrawing();
  db.addEntry(d.id, 'Solo Person', 'solo@example.com', '');
  assert.throws(() => db.runDraw(d.id, 5), /not enough/);
});
