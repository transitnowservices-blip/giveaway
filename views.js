'use strict';
/** HTML templates for the giveaway app. */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function layout(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} \u2014 Monthly Giveaway</title>
<link rel="stylesheet" href="/style.css"></head>
<body><div class="wrap">
<header class="brand"><div class="brand-mark">\u2728</div><div>
<div class="brand-name">Monthly Giveaway</div>
<div class="brand-sub">Free to enter \u00b7 Winners drawn at random</div></div></header>
${body}
<footer><a href="/rules">Official Rules</a> \u00b7 <a href="/winners">Past Winners</a> \u00b7 <a href="/admin">Admin</a></footer>
</div></body></html>`;
}

function prizeList(prizes) {
  return `<ul class="prizes">` + prizes.map(p =>
    `<li><span class="prize-name">${esc(p.name)}</span>` +
    (p.detail ? `<span class="prize-detail">${esc(p.detail)}</span>` : '') + `</li>`).join('') + `</ul>`;
}

function entryPage(drawing, prizes, opts) {
  opts = opts || {};
  const msg = opts.error ? `<div class="alert error">${esc(opts.error)}</div>`
    : opts.success ? `<div class="alert success">${esc(opts.success)}</div>` : '';
  const form = drawing ? `
    <div class="card"><h2>Enter the ${esc(drawing.month_label)} Drawing</h2>
    <p class="muted">\u201c${esc(drawing.title)}\u201d \u2014 one entry per email. Winners picked at random.</p>
    ${msg}
    <form method="POST" action="/enter">
      <input type="hidden" name="drawing_id" value="${drawing.id}">
      <label>Your name<input name="name" required minlength="2" autocomplete="name" placeholder="Full name"></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
      <label>Phone <span class="opt">(optional)</span><input name="phone" type="tel" autocomplete="tel" placeholder="(414) 555-0100"></label>
      <button type="submit">Enter Free</button>
    </form>
    <p class="fine">No purchase necessary. See <a href="/rules">Official Rules</a>.</p></div>`
    : `<div class="card"><h2>No drawing open right now</h2><p class="muted">Check back soon \u2014 a new drawing opens every month.</p></div>`;
  return layout(drawing ? drawing.title : 'Monthly Giveaway', `
    <div class="hero"><h1>Win Big. Enter Free.</h1>
    <p>Every month we draw <strong>3\u201310 winners</strong> at random. One entry per person.</p></div>
    <div class="card"><h2>This Month's Prizes</h2>${prizeList(prizes)}</div>
    ${form}`);
}

function rulesPage() {
  return layout('Official Rules', `<div class="card"><h1>Official Rules</h1>
  <ol class="rules">
  <li><strong>No purchase necessary</strong> to enter or win. A purchase does not improve your chances.</li>
  <li><strong>Eligibility:</strong> 18 or older, U.S. resident. One entry per person per drawing (by email).</li>
  <li><strong>How to enter:</strong> fill out the entry form on this site before the drawing closes.</li>
  <li><strong>Drawing:</strong> winners are chosen at random from all eligible entries using a computerized random drawing, once per month. Typical drawings select 3\u201310 winners.</li>
  <li><strong>Prizes:</strong> as listed for each month's drawing. Cash prizes are paid electronically. Subscription/membership prizes are non-transferable and have no cash value.</li>
  <li><strong>Winner notification:</strong> winners are notified by email and/or phone within 7 days and announced on the Winners page (first name, last initial).</li>
  <li><strong>Odds</strong> depend on the number of eligible entries received.</li>
  <li>Sponsor reserves the right to cancel or modify the drawing if fraud or technical failures compromise fairness.</li>
  </ol></div>`);
}

function publicWinners(drawings, db) {
  const blocks = drawings.filter(d => d.status === 'closed').map(d => {
    const winners = db.listWinners(d.id);
    if (!winners.length) return '';
    const rows = winners.map(w => {
      const parts = String(w.name).trim().split(/\s+/);
      const shown = parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1][0] + '.' : '');
      return `<li><strong>${esc(shown)}</strong> \u2014 ${esc(w.prize_name || 'Prize')}</li>`;
    }).join('');
    return `<div class="card"><h2>${esc(d.month_label)} Winners</h2><ul class="winners">${rows}</ul></div>`;
  }).join('');
  return layout('Past Winners', `<div class="hero"><h1>Past Winners</h1></div>${blocks || '<div class="card"><p class="muted">No drawings completed yet.</p></div>'}`);
}

function adminLogin(error) {
  return layout('Admin Login', `<div class="card narrow"><h2>Admin Login</h2>
  ${error ? `<div class="alert error">${esc(error)}</div>` : ''}
  <form method="POST" action="/admin/login"><label>Password<input type="password" name="password" required></label>
  <button type="submit">Log In</button></form></div>`);
}

function adminDashboard(drawings, openDrawing, db, msg) {
  const open = openDrawing ? `
    <div class="card"><h2>Open Drawing: ${esc(openDrawing.title)} (${esc(openDrawing.month_label)})</h2>
    <p class="muted">${db.listEntries(openDrawing.id).length} entries so far.</p>
    ${msg ? `<div class="alert ${msg.ok ? 'success' : 'error'}">${esc(msg.text)}</div>` : ''}
    <h3>Prizes</h3>${prizeList(db.listPrizes(openDrawing.id))}
    <form method="POST" action="/admin/drawings/${openDrawing.id}/prizes" class="inline-form">
      <input name="name" placeholder="Prize name" required><input name="detail" placeholder="Detail (optional)">
      <button type="submit">Add Prize</button></form>
    <h3>Run the Drawing</h3>
    <form method="POST" action="/admin/drawings/${openDrawing.id}/draw" class="inline-form"
      onsubmit="return confirm('Draw winners now? This closes the drawing.')">
      <label>Winners <input name="winners" type="number" min="1" max="25" value="5" style="width:70px"></label>
      <button type="submit" class="gold">Draw Winners</button></form>
    <p class="fine">Winners are picked at random and prizes assigned in prize-list order.</p>
    <p><a href="/admin/drawings/${openDrawing.id}/entries.csv">Download entries backup (CSV)</a></p></div>`
    : `<div class="card"><h2>Start a New Drawing</h2>
    ${msg ? `<div class="alert ${msg.ok ? 'success' : 'error'}">${esc(msg.text)}</div>` : ''}
    <form method="POST" action="/admin/drawings" class="inline-form">
      <input name="title" placeholder="Drawing title (e.g. October Giveaway)" required>
      <input name="month_label" placeholder="Month (e.g. October 2026)" required>
      <button type="submit">Open Drawing</button></form></div>`;

  const hist = drawings.map(d => {
    const w = d.status === 'closed' ? db.listWinners(d.id).map(x => {
      const parts = String(x.name).trim().split(/\s+/);
      return esc(parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1][0] + '.' : '')) + ' \u2014 ' + esc(x.prize_name || 'Prize');
    }).join('<br>') : '<span class="muted">open</span>';
    return `<tr><td>${esc(d.month_label)}</td><td>${esc(d.title)}</td><td>${d.entry_count}</td><td>${d.winner_count}</td><td>${w}</td></tr>`;
  }).join('');

  return layout('Admin', `${open}
    <div class="card"><h2>Drawing History</h2>
    <table class="tbl"><tr><th>Month</th><th>Title</th><th>Entries</th><th>Winners</th><th>Results</th></tr>${hist}</table>
    <p><a href="/admin/logout">Log out</a></p></div>`);
}

module.exports = { layout, entryPage, rulesPage, publicWinners, adminLogin, adminDashboard, esc };
