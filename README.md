# Roblox Admin Panel Starter

A complete starter for a Roblox game admin panel using:

- GitHub Pages: static frontend
- Cloudflare Worker: REST API
- Cloudflare D1: admin/cache/audit database
- Roblox HttpService: game ↔ Worker communication

## Important architecture

Roblox DataStores remain authoritative for actual game stats. D1 stores a searchable player cache, active sessions, ban records, command queue, and append-only audit logs. Admin stat changes are sent to Roblox servers as commands so the game can update its DataStore safely.

The Roblox server polls for commands every few seconds. This means kick/edit/reset actions are near-real-time rather than requiring the Worker to directly control a Roblox server.

## 1. Create the D1 database

From `worker/`:

```bash
npm install
npx wrangler d1 create roblox-admin
```

Copy the returned database ID into `wrangler.jsonc`.

Apply the schema:

```bash
npx wrangler d1 execute roblox-admin --remote --file=./schema.sql
```

## 2. Configure Worker secrets

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ROBLOX_API_KEY
npx wrangler secret put ROBLOX_SERVER_SECRET
```

`ROBLOX_API_KEY` is reserved for optional Roblox Open Cloud integration. The starter does not expose it to the browser.

Set variables in `wrangler.jsonc`:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `CORS_ORIGIN` (your GitHub Pages origin)

For production, replace the bootstrap username/password approach with a proper multi-admin identity system.

## 3. Run Worker locally

```bash
cd worker
npm install
npm run dev
```

## 4. Deploy Worker

```bash
npm run deploy
```

Cloudflare's current Wrangler documentation recommends `wrangler.jsonc` for new projects. See the official docs linked below.

## 5. GitHub Pages

Upload the `website/` folder to a GitHub repository and configure GitHub Pages to publish the repository root (or copy the website contents into the root).

Edit `website/js/config.js` and set:

```js
window.APP_CONFIG = {
  API_BASE: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev"
};
```

## 6. Roblox setup

Put the scripts from `roblox/` into `ServerScriptService`.

Create these server environment values in `ServerScriptService` or a secure server-only ModuleScript:

- `API_BASE_URL`
- `SERVER_SECRET`

Do not put the server secret in a LocalScript or anything replicated to clients.

The scripts track players, send heartbeats, cache stats to D1, poll commands, and enforce bans.

## Default API behavior

### Browser/admin

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/active`
- `GET /api/players`
- `GET /api/players/:id`
- `GET /api/servers`
- `GET /api/bans`
- `GET /api/audit-logs`
- `POST /api/admin/kick`
- `POST /api/admin/ban`
- `POST /api/admin/unban`
- `POST /api/admin/stats/edit`
- `POST /api/admin/stats/reset`

### Roblox server

- `POST /api/roblox/heartbeat`
- `POST /api/roblox/player-join`
- `POST /api/roblox/player-leave`
- `POST /api/roblox/player-stats`
- `GET /api/roblox/commands?serverId=...`
- `POST /api/roblox/commands/:id/ack`
- `GET /api/roblox/ban-check/:userId`

## Security notes

- Browser requests never contain the Roblox server secret.
- Admin sessions are signed by the Worker.
- Roblox endpoints require the server secret.
- D1 credentials are never sent to the browser.
- Every admin action, including failed actions, is written to `audit_logs`.
- Ban/kick/reset/edit requests are command records and are executed by the Roblox server.

## Official docs

Cloudflare Wrangler: https://developers.cloudflare.com/workers/wrangler/
Cloudflare D1: https://developers.cloudflare.com/d1/
Roblox Open Cloud: https://create.roblox.com/docs/cloud
