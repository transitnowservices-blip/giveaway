'use strict';
/**
 * server.js — standalone monthly giveaway app.
 * Public: entry form, rules, winners. Admin: drawings, prizes, random draw.
 * Not connected to the TransitNow funnel in any way.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const views = require('./views');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'giveaway-admin';
if (!process.env.ADMIN_PASSWORD) {
  console.log('WARNING: using default admin password. Set ADMIN_PASSWORD env var.');
}

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// --- tiny cookie session ---
const sessions = new Map();
function getSession(req) {
  const h = req.headers.cookie || '';
  const m = h.match(/(?:^|;\s*)gw_admin=([A-Za-z0-9_-]+)/);
  return m && sessions.has(m[1]) ? m[1] : null;
}
function requireAdmin(req, res, next) {
  if (getSession(req)) return next();
  res.redirect('/admin');
}

// --- public ---
app.get('/', (req, res) => {
  const d = db.getOpenDrawing();
  const prizes = d ? db.listPrizes(d.id) : [];
  res.send(views.entryPage(d, prizes, { error: req.query.error, success: req.query.success }));
});

app.post('/enter', (req, res) => {
  const id = Number(req.body.drawing_id);
  try {
    db.addEntry(id, req.body.name, req.body.email, req.body.phone);
    res.redirect('/?success=' + encodeURIComponent("You're in! Winners are drawn at random \u2014 good luck."));
  } catch (e) {
    res.redirect('/?error=' + encodeURIComponent(e.message));
  }
});

app.get('/rules', (req, res) => res.send(views.rulesPage()));
app.get('/winners', (req, res) => res.send(views.publicWinners(db.listDrawings(), db)));

// --- admin ---
app.get('/admin', (req, res) => {
  if (getSession(req)) return res.redirect('/admin/dashboard');
  res.send(views.adminLogin(req.query.error));
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const t = crypto.randomBytes(24).toString('base64url');
    sessions.set(t, Date.now());
    res.setHeader('Set-Cookie', `gw_admin=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/admin?error=' + encodeURIComponent('Wrong password.'));
});

app.get('/admin/logout', (req, res) => {
  const t = getSession(req);
  if (t) sessions.delete(t);
  res.setHeader('Set-Cookie', 'gw_admin=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/admin');
});

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const drawings = db.listDrawings();
  const open = db.getOpenDrawing();
  const msg = req.query.msg ? { ok: req.query.ok === '1', text: req.query.msg } : null;
  res.send(views.adminDashboard(drawings, open, db, msg));
});

function back(ok, text) {
  return '/admin/dashboard?ok=' + (ok ? '1' : '0') + '&msg=' + encodeURIComponent(text);
}

app.post('/admin/drawings', requireAdmin, (req, res) => {
  try {
    db.createDrawing(req.body.title, req.body.month_label);
    res.redirect(back(true, 'Drawing opened.'));
  } catch (e) { res.redirect(back(false, e.message)); }
});

app.post('/admin/drawings/:id/prizes', requireAdmin, (req, res) => {
  try {
    db.addPrize(Number(req.params.id), req.body.name, req.body.detail);
    res.redirect(back(true, 'Prize added.'));
  } catch (e) { res.redirect(back(false, e.message)); }
});

app.post('/admin/drawings/:id/draw', requireAdmin, (req, res) => {
  try {
    const winners = db.runDraw(Number(req.params.id), req.body.winners);
    res.redirect(back(true, `Drew ${winners.length} winner${winners.length === 1 ? '' : 's'}. Drawing closed.`));
  } catch (e) { res.redirect(back(false, e.message)); }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// CSV backup of entries (protects against ephemeral disks on free hosting)
app.get('/admin/drawings/:id/entries.csv', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.getDrawing(id);
  if (!d) return res.status(404).send('Drawing not found.');
  const rows = db.listEntries(id);
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = ['name,email,phone,entered_at']
    .concat(rows.map(e => [q(e.name), q(e.email), q(e.phone),
      q(new Date(e.created_at).toISOString())].join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="giveaway-entries-${d.month_label.replace(/\s+/g, '-').toLowerCase()}.csv"`);
  res.send(csv);
});

app.listen(PORT, () => console.log(`Giveaway app listening on port ${PORT}`));
