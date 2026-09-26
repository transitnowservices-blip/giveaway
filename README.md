# Monthly Giveaway App (standalone)

A tiny standalone web app for running a monthly random drawing. **Not connected
to the TransitNow funnel** \u2014 separate code, separate database.

## How it works

1. **Admin** opens a drawing for the month (default prizes are seeded: $500 cash,
   Wealth Builder's Room month, TransitNow Complete month, The Blueprint).
   Prizes can be edited before the draw.
2. **People** enter free at `/` (name + email, phone optional). One entry per
   email per drawing.
3. **Admin** picks how many winners (3\u201310, or any 1\u201325) and hits Draw.
   Winners are chosen with crypto-random shuffling; prizes assign in prize-list
   order. The drawing closes automatically.
4. Winners are announced on `/winners` (first name, last initial) and notified
   by the admin from the dashboard list.

## Run it

```bash
cd ~/workspace/giveaway
npm install
ADMIN_PASSWORD=your-secret-password PORT=3000 npm start
```

Then open `http://localhost:3000` (public) and `/admin` (dashboard).

## Deploy (Render, free tier)

- New Web Service \u2192 point at this folder's repo (or upload).
- Build: `npm install` \u00b7 Start: `npm start`
- Set env vars: `ADMIN_PASSWORD`, and a persistent disk mounted for
  `giveaway.db` (or set `GIVEAWAY_DB` to the disk path) so entries survive
  restarts.

## Notes

- Entry is always free; official rules live at `/rules` (no purchase necessary).
- Default admin password is `giveaway-admin` \u2014 change it via `ADMIN_PASSWORD`.
- Tests: `npm test`
