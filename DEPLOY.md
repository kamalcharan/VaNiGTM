# DEPLOY.md — how VaNi reaches production

> The one page for "where does it run and how do I ship it". CLAUDE.md points
> here; `deploy/vani-main-vps/RUNBOOK.md` keeps the first-time setup history.
> Everything below was checked on the Main VPS on **2026-09-30**. Anything
> marked *confirm* was not read off the box — run the command next to it
> before relying on it.
>
> **Claude sessions cannot reach the VPS** (no SSH, no DB port, no HTTP to
> internal hosts). Every command here is run by Charan and the output pasted
> back.

---

## 1. What runs where

```
                       ┌───────────────────────── Vercel ─────────────────────────┐
browser ──────────────►│ www.vikuna.io   vikunawebsite repo, root /  (Vite site)  │
                       │ vani.vikuna.io  vikunawebsite repo, root vani-app/       │
                       │                 (Next.js console, NEXT_PUBLIC_API_ORIGIN │
                       │                  = https://api.vikuna.io)                │
                       └──────────────────────────────────────────────────────────┘
browser (console, widget iframe) calls the API DIRECTLY, credentials included
        │
        ▼
┌──────────────────────────── Main VPS  (srv1528480) ────────────────────────────┐
│ vikuna-nginx      :80/:443  api.vikuna.io → upstream vani_backend              │
│   │                         (also dristiq.com, mcp-db.dristiq.com)             │
│   ▼                                                                            │
│ vani-backend      :3001     Express API  (image vani-backend:latest)           │
│ vani-worker       —         same image, `node dist/agent-core/worker.js`       │
│   │                         polls gt_events every 3s                           │
│   ▼                                                                            │
│ PostgreSQL        vani_gtm_db on the shared docker network (172.18.0.6)        │
│                   runtime role today: vikuna_admin (see §6)                    │
└────────────────────────────────────────────────────────────────────────────────┘
LLM: platform model from .env (Haiku today, api.anthropic.com); SearXNG from SEARXNG_URL
```

`frontend/` in this repo is **retired** and is not deployed anywhere.
Track H (`documents/POA-2026-09-30-repo-consolidation.md`) moves `vani-app/`
into this repo; when it lands, §1 and §5 change — update them in that PR.

## 2. Folder structure that matters for deploys

### In this repo

```
VaNiGTM/
├── backend/                       the API and the worker (one image, two commands)
│   ├── src/server.ts              API entry  → dist/server.js
│   ├── src/agent-core/worker.ts   worker     → dist/agent-core/worker.js
│   ├── src/migrate.ts             runner     → dist/migrate.js (baked into the image)
│   ├── migrations/                001…258 — see §4
│   └── .env.example               every variable the code reads
├── deploy/vani-main-vps/
│   ├── deploy-vani.sh             THE redeploy command (§3)
│   ├── Dockerfile                 image build (context = backend/)
│   ├── docker-compose.vani.yml    reference compose: vani-backend + vani-worker
│   ├── .env.example               compose-level variables (IMAGE_TAG, NETWORK_NAME, …)
│   ├── api.vikuna.io.conf         LIVE nginx site config (copied off the box)
│   ├── vani-cors.inc              LIVE CORS include (.inc, never .conf)
│   ├── smoke-test.sh              black-box HTTP checks, run from a laptop
│   ├── post-deploy-check.sql      RLS / schema checks
│   ├── rls-two-tenant-test.sql    isolation test — run as the app role
│   ├── verify-phase0-findings.sql read-only production facts
│   └── RUNBOOK.md                 first-time setup, history
├── DEPLOY.md                      this file
└── CLAUDE.md                      working notebook — rulings, traps
```

### On the Main VPS

| Path | What |
|---|---|
| `/opt/vikuna/src/vanigtm` | git checkout of this repo — **deploys build from here** |
| compose dir *(confirm)* | where the running compose files and `.env` live. Read it off the container rather than remembering it: `docker inspect vani-backend --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'` (historically `/opt/vikuna/docker/vani`) |
| `/opt/vikuna/docker/docker/config/nginx/conf.d/` | nginx site configs, bind-mounted to `vikuna-nginx:/etc/nginx/conf.d/` |
| `/opt/vikuna/docker/docker/config/nginx/nginx.conf` | nginx main config → `/etc/nginx/nginx.conf` |
| `/etc/letsencrypt/live/api.vikuna.io/` | TLS cert for the API |
| `/var/lib/docker/volumes/docker_nginx_logs/_data` | nginx logs → `vani_access.log`, `vani_error.log` |

## 3. Deploy the API + worker (the normal case)

```bash
cd /opt/vikuna/src/vanigtm
git status                          # must be clean
git fetch origin && git checkout main && git pull origin main
git log --oneline -1                # the commit you mean to ship

bash deploy/vani-main-vps/deploy-vani.sh
```

The script builds the image **on the box**, tagged exactly as the running
compose expects, recreates **both** `vani-backend` and `vani-worker`, and
stops if they end up on different images (a stale worker consumes queued
events without running them).

- ⚠️ **Never `docker compose pull` afterwards** — it swaps in the stale Docker
  Hub image and silently undoes the deploy.
- `vani-worker … (unhealthy)` is expected: the image's healthcheck probes a
  port the worker does not bind.
- Env changes (`.env` in the compose dir) need a recreate, not a reload —
  re-run the script, or `docker compose … up -d --force-recreate vani-backend vani-worker`.

### Verify

```bash
docker ps --filter name=vani --format '{{.Names}}\t{{.Status}}'
docker logs --tail 30 vani-backend        # "Loaded N skills", "API running on port 3001"
docker logs --tail 30 vani-worker         # "[Worker] Starting — polling …"
docker logs vani-worker 2>&1 | grep -c "Poll error"      # must be 0

curl -s https://api.vikuna.io/health      # {"status":"ok",…"db":{"ok":true…}}
curl -s -X POST https://api.vikuna.io/api/v1/embed/boot \
  -H 'Content-Type: application/json' -d '{}'
# {"error":{"code":"INVALID_INPUT",…}}  = the API answered.
# An HTML page saying nginx/1.29.7 404 = nginx has no route for it (§5).
```

(`/health` reports `"service":"prokey-api"` — a name inherited from the
ProKey backend this started from. It is the VaNi API.)

### Roll back

```bash
cd /opt/vikuna/src/vanigtm
git checkout <previous-good-sha>
bash deploy/vani-main-vps/deploy-vani.sh
git checkout main                         # leave the checkout on main afterwards
```

Migrations are never rolled back by this — if the bad deploy applied one,
say so and decide separately.

## 4. Migrations

**Manual only. Never automatic. Always from inside the container:**

```bash
docker exec vani-backend node dist/migrate.js --status   # read-only
docker exec vani-backend node dist/migrate.js            # apply pending
```

- Run `--status` first; apply only what you expect to see pending. Anything
  unexpected → stop and paste the output.
- **Never apply from a Windows checkout and never by pasting SQL into
  psql/pgAdmin.** The runner records each file by name + MD5. A Windows
  checkout records the CRLF hash (shows as `⚠ modified` forever); pasted SQL
  records nothing (shows as `○ pending` although the objects exist). Both
  happened, and on 2026-09-30 `vn_migrations` had to be reconciled by hand —
  CLAUDE.md → Migrations has the detail.
- A migration is applied when `--status` says so, not when the commit that
  added it is deployed.
- Highest = **258**, next = **259**. Two files share 249; never reuse a number.
- Schema changes need Charan's approval before the file is written.

Read-only DB checks from the container (same connection the API uses):

```bash
docker exec -i vani-backend node - <<'EOF'
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DB_PRIMARY,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
(async () => { await c.connect();
  const r = await c.query(`SELECT current_database() db, current_user usr`);
  console.log(r.rows); await c.end(); })();
EOF
```

## 5. nginx (api.vikuna.io)

The repo files **are** the live config. Edit them here, commit, then copy:

```bash
F=/opt/vikuna/docker/docker/config/nginx/conf.d
cp "$F/api.vikuna.io.conf" "$F/api.vikuna.io.conf.bak-$(date +%Y%m%d-%H%M)"
cp deploy/vani-main-vps/api.vikuna.io.conf deploy/vani-main-vps/vani-cors.inc "$F/"
docker exec vikuna-nginx nginx -t && docker exec vikuna-nginx nginx -s reload
```

Restore on failure: copy the `.bak-…` file back and reload.

- **Routing:** named locations for the older prefixes, then a catch-all
  `location /api/v1/` (added 2026-09-30) so every API route reaches the
  backend. Before it, `/skills`, `/vara`, `/etl`, `/embed` and
  `/llm-provider` all answered nginx's 404 in production.
- **Public routes** (no JWT, by design) are listed in the config's header.
  Adding one is a decision; add it to that list.
- **CORS is enforced by nginx** through the `$cors_origin` map
  (`vikuna.io`, `vani.vikuna.io`, `vani-app-*.vercel.app`). The container's
  own `CORS_ORIGIN` is unset in production and prints
  `http://localhost:3000` at startup — harmless. A new console origin is a
  line in the map.
- **Timeouts:** 300s on LLM-bearing paths (`ingest`, `profile`, `vani`, the
  catch-all); 30s default otherwise.
- CORS check, from anywhere:

  ```bash
  curl -si -X OPTIONS https://api.vikuna.io/api/v1/skills/runs/list \
    -H 'Origin: https://vani.vikuna.io' -H 'Access-Control-Request-Method: POST' \
    | grep -i '^access-control-allow-origin'
  ```

## 6. VPS reference

| Thing | Value |
|---|---|
| Host | `srv1528480` (Main VPS) |
| Containers | `vani-backend`, `vani-worker`, `vikuna-nginx`, the Postgres container on the shared network (`docker ps` to list) |
| Docker network | shared, external — name in the compose `.env` as `NETWORK_NAME` *(confirm: `docker inspect vani-backend --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'`)* |
| API port | 3001 in the container; public only through nginx |
| Database | `vani_gtm_db` |
| Runtime DB role | `vikuna_admin` as read on 2026-09-30 — which is SUPERUSER + BYPASSRLS. CLAUDE.md says the cutover pointed `DB_PRIMARY` at `vanigtm_app`; the box says otherwise. **Open question for Charan** — see `docs/db/rls-status.md` |
| Console | `vani.vikuna.io` (Vercel, vikunawebsite repo, root `vani-app/`); env `NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io` |
| Website | `www.vikuna.io` (Vercel, vikunawebsite repo, root `/`) |
| Other vhosts on the same nginx | `dristiq.com`, `mcp-db.dristiq.com` (the read-only DB MCP) — not ours to change from here |

### Environment variables (names only — values live on the box)

The full list with comments is `backend/.env.example`. The ones a deploy
touches most:

| Group | Variables |
|---|---|
| Core | `DB_PRIMARY`, `DB_PRIMARY_SSL`, `JWT_SECRET`, `PORT`, `NODE_ENV` |
| Secrets | `TENANT_SECRET_KEY` (+ `_PREVIOUS` during rotation) — no default, BYOK refuses to save without it |
| LLM | `LLM_PRIMARY_URL`, `LLM_PRIMARY_MODEL`, `LLM_PRIMARY_KEY`, `LLM_CONTEXT_TOKENS`, `LLM_MAX_CONCURRENT`, `LLM_PRIMARY_TIMEOUT_MS`, `ANTHROPIC_API_KEY`, `LLM_FAILOVER_MODEL`, `HAIKU_DEFAULT` |
| Worker | `WORKER_POLL_MS`, `WORKER_BATCH_SIZE`, `WORKER_STALE_CLAIM`, `WORKER_MAX_ATTEMPTS`, `WORKER_HEARTBEAT_MS` |
| Integrations | `SEARXNG_URL`, `N8N_RENDER_URL`, `N8N_RENDER_SECRET`, `N8N_ENV`, `GDRIVE_*` |
| CORS (dev only) | `CORS_ORIGIN` — comma-separated; production uses nginx instead |

Never commit a value. Never print `.env` into a chat.

## 7. The console (Vercel)

Deploys automatically from `main` of **kamalcharan/vikunawebsite**. Nothing to
run. Two things make it work against production and both live outside Vercel:
the API routes it calls must exist behind nginx (§5), and its origin must be in
the `$cors_origin` map. "Cannot reach the VaNi service" in the console is
usually one of those two, not the API being down — `curl` cannot reproduce a
CORS refusal, so check with the `OPTIONS` command in §5.

## 8. Checklist — a deploy is done when

- [ ] `git log -1` on the box is the commit you meant
- [ ] `deploy-vani.sh` printed "same image"
- [ ] `migrate.js --status`: 0 pending, no ⚠ you did not expect
- [ ] `Poll error` count is 0
- [ ] `/health` ok; `/embed/boot` answers JSON
- [ ] anything that changed here (paths, containers, env names) is updated in this file
