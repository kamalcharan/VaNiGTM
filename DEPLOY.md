# DEPLOY.md — how VaNi reaches production

> Commands only, for copy-paste: `deploy.txt` at the repo root. This page explains them.
>
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
browser ──────────────►│ www.vikuna.io   VaNiGTM repo, root web/  (Vite site)     │
                       │ vani.vikuna.io  VaNiGTM repo, root vani-app/             │
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

One repo since 2026-10-01 (Track H): the console and the website build on
Vercel from this repo's `vani-app/` and `web/` (both projects re-pointed to
VaNiGTM by Charan, 2026-10-01).

## 2. Folder structure that matters for deploys

### In this repo

```
VaNiGTM/
├── backend/                       the API and the worker (one image, two commands)
│   ├── src/server.ts              API entry  → dist/server.js
│   ├── src/agent-core/worker.ts   worker     → dist/agent-core/worker.js
│   ├── src/migrate.ts             runner     → dist/migrate.js (baked into the image)
│   ├── migrations/                001…267 — see §4
│   └── .env.example               every variable the code reads
├── deploy/vani-main-vps/
│   ├── deploy-vani.sh             THE redeploy command (§3)
│   ├── Dockerfile                 image build (context = backend/)
│   ├── docker-compose.vani.yml    reference compose: vani-backend + vani-worker
│   ├── .env.example               compose-level variables (IMAGE_TAG, NETWORK_NAME, …)
│   ├── api.vikuna.io.conf         LIVE nginx site config (copied off the box)
│   ├── vani-cors.inc              LIVE CORS include (.inc, never .conf)
│   ├── smoke-test.sh              black-box HTTP checks, run from a laptop
│   ├── checks/                    one read-only check per release (deploy.txt says which)
│   ├── post-deploy-check.sql      RLS / schema checks
│   ├── rls-two-tenant-test.sql    isolation test — run as the app role
│   ├── verify-phase0-findings.sql read-only production facts
│   └── RUNBOOK.md                 first-time setup, history
├── DEPLOY.md                      this file
├── deploy.txt                     the commands only, plus the current release's extra steps
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

> **Update `.env` BEFORE deploying a change that adds settings.** Since
> 2026-09-30 every LLM and worker setting is required with no defaults; a
> missing one stops both containers at start (`LLM_CONFIG_INVALID` /
> `WORKER_CONFIG_INVALID`, listing every missing key) and the API answers 502
> until it is fixed. That happened on the first deploy of it: three keys
> (`LLM_CONTEXT_TOKENS`, `LLM_MAX_CONCURRENT`, `HAIKU_DEFAULT`) had never been
> set on the box because the code used to default them. Compare the compose
> `.env` against `backend/.env.example` first; a fix is an `.env` edit plus
> `docker compose … up -d --force-recreate vani-backend vani-worker`, no rebuild.

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
- ⚠️ **After ANY recreate of `vani-backend`, reload nginx** — the script does
  it; a manual `up -d --force-recreate` does not. The container gets a new
  internal IP and nginx's `upstream vani_backend` still points at the old one,
  so `api.vikuna.io` answers **502 while the container says healthy**
  (2026-09-30, after the role switch):
  `docker exec vikuna-nginx nginx -t && docker exec vikuna-nginx nginx -s reload`

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

The runner connects with `DB_MIGRATE` when it is set, else `DB_PRIMARY`, and
prints which (`[Migrate] connecting as …`). Once the runtime is `vanigtm_app`
(§4b), `DB_MIGRATE` must hold the owner's URL — the app role cannot run DDL.

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
- Highest in the repo = **267** (264–267: common pool P1-A, 2026-10-02).
  **263 is reserved** for the DPDP notice and is not in `migrations/`. Next new
  file = **268**. Two files share 249; never reuse a number.
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

## 4b. Switching the runtime role to `vanigtm_app` (decided 2026-09-30)

> ✅ **DONE 2026-10-02 (Charan): the runtime is `vanigtm_app`** — proven inside vani-backend (`current_user = vanigtm_app`, `rolsuper = false`, `rolbypassrls = false`), the runner reports `connecting as vikuna_admin (DB_MIGRATE)`, preflight checks 1–6 OK, no permission errors while the console was used. Check 7 (REVIEW): the 31 `vani_*`/`vara_*` tables are OWNED by `vanigtm_app` and unforced, so on those the owner bypass still applies and isolation is the code's `WHERE tenant_id` only — forcing them is a follow-up (CLAUDE.md VPS tasks). History: on 2026-09-30 23:40 the box was found back on `vikuna_admin` after a whole-file `.env` swap; edit `DB_*` / `LLM_*` lines, never copy a file over `.env`.

Today the API and worker connect as `vikuna_admin` — SUPERUSER + BYPASSRLS —
so every RLS policy is skipped and tenant isolation is only the
`WHERE tenant_id = …` in the code. The switch makes the database enforce it.
**Decided by Charan on 2026-09-30.** Evidence and the blockers found on the way:
`docs/db/rls-status.md` §14.

Order matters — each step is safe on its own and nothing changes behaviour
until step 5:

```bash
cd /opt/vikuna/src/vanigtm

# 1. Deploy the code that makes the switch possible (works under BOTH roles —
#    verified by running the same probe as each).
git pull origin main && bash deploy/vani-main-vps/deploy-vani.sh

# 2. Migration 259 (vani_tenant self-provision policy) — APPLIED 2026-09-30.
#    Confirm it reads applied (preflight check 6 checks the policy too):
docker exec vani-backend node dist/migrate.js --status | tail -3   # 0 pending

# 3. Grants — idempotent; covers tables added since it last ran.
#    Runs as vikuna_admin through psql. The database container is
#    vikuna-postgres (NOT vikuna-postgrest, the REST layer, nor kd-mcp-db).
#    Confirm: docker exec vikuna-postgres psql -U vikuna_admin -d vani_gtm_db -Atc "select current_database()"
PG=vikuna-postgres
docker exec -i $PG psql -U vikuna_admin -d vani_gtm_db < scripts/grant-vanigtm-app.sql

# 4. Preflight — READ-ONLY. Every row must say OK.
docker exec -i $PG psql -U vikuna_admin -d vani_gtm_db < deploy/vani-main-vps/vanigtm-app-preflight.sql
```

5. **The switch** — in the compose `.env` (compose dir, §2):
   - `DB_PRIMARY` → the same URL with `vanigtm_app` and its password. If nobody
     has the password, set one as admin: `ALTER ROLE vanigtm_app PASSWORD '…';`
     — typed into psql, never pasted into a chat or committed.
   - `DB_MIGRATE` → the current `vikuna_admin` URL (the runner prefers it, so
     migrations keep running as the owner).
   - Recreate: `bash deploy/vani-main-vps/deploy-vani.sh` (or `up -d
     --force-recreate vani-backend vani-worker` from the compose dir).

6. **Prove the role changed** — the API must now be `vanigtm_app`:

```bash
docker exec -i vani-backend node - <<'EOF'
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DB_PRIMARY,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
(async () => { await c.connect();
  console.log((await c.query(`SELECT current_user, r.rolsuper, r.rolbypassrls
    FROM pg_roles r WHERE r.rolname = current_user`)).rows); await c.end(); })();
EOF
# expect [ { current_user: 'vanigtm_app', rolsuper: false, rolbypassrls: false } ]
docker exec vani-backend node dist/migrate.js --status | head -3
# expect "[Migrate] connecting as vikuna_admin (DB_MIGRATE)"
docker logs --tail 50 vani-backend 2>&1 | grep -iE "permission denied|row-level security"   # expect nothing
```

### What to test after the switch, in the console

Log in as a real tenant and walk these. Each one is a path that reads or
writes an RLS table; the ones marked ★ were broken before today's fixes and
are the reason for this list.

| # | Do this | Expect | If it fails it looks like |
|---|---|---|---|
| 1 | Log in, log out, log in again; refresh the page after 15 min | Session holds | Bounced to login |
| 2 | Dashboard, Smart Profile, Knowledge, Knowledge Graph | Same data as before the switch | Empty screens where there was data — the loudest sign of a missed path |
| 3 | ★ Vara → Install screen | Your domain(s), origins, snippet | "No domains" / "Complete the Domain step first" |
| 4 | ★ Add, then remove, an origin on Install | Saved; list updates | 500 or unchanged list |
| 5 | ★ Load a page with the snippet (Phase 4 gate) | Widget boots; boot time appears on Install | "Not available on this site" on an allowlisted page |
| 6 | Vara: publish or edit a JD, open JD Studio, Prompts | Works as before | "Could not publish this JD" |
| 7 | Runs, Events, Awaiting (`/runs…`) | Your runs, none of anyone else's | Empty |
| 8 | Settings → Model: open, test, save the provider | Saves; key hint shown | Save "succeeds" but nothing is stored |
| 9 | Teach VaNi: submit a URL or a paragraph | Run appears, finishes, entries show in Knowledge | Run completes with 0 entries |
| 10 | Imports: upload a small CSV, map, stage | Staged rows appear | 500 on upload / empty session |
| 11 | ★ Sign up a brand-new test tenant, do the Domain step | Completes; Install shows the domain | "Failed to update onboarding step" (= 259 not applied) |
| 12 | Two tenants, two browsers: compare Runs, Contacts, Knowledge | Each sees only its own | Anything shared |

Watch while testing: `docker logs -f vani-backend 2>&1 | grep -iE "error|denied|security"`.

### Roll back

Put `DB_PRIMARY` back to the `vikuna_admin` URL, remove `DB_MIGRATE`, recreate.
Nothing in steps 1–4 needs undoing: the code runs under both roles, and 259
and the grants are inert under a role that bypasses RLS.

### Still running as the owner, on purpose

Operator CLIs read across tenants and are not the runtime: `npm run packs`,
`cohort`, `research`, `seed`, `intents:embed`. Inside the container they take
`DB_PRIMARY`, so after the switch run them with the owner's URL:
`docker exec -e DB_PRIMARY="$DB_MIGRATE" vani-backend …` (or from the VPS
checkout with the admin URL in the environment).

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
| Containers | `vani-backend`, `vani-worker`, `vikuna-nginx`, `vikuna-postgres` (the database; `vikuna-postgrest` and `kd-mcp-db` are other services) |
| Docker network | shared, external — name in the compose `.env` as `NETWORK_NAME` *(confirm: `docker inspect vani-backend --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'`)* |
| API port | 3001 in the container; public only through nginx |
| Platform LLM | **Haiku as primary since 2026-09-30 evening (Charan: "let haiku run now")**: `claude-haiku-4-5` at `https://api.anthropic.com/v1`, window 100000, 4 at a time, no system suffix. The qwen settings (`qwen3-4b` at `http://vikuna-llm:8080`, window 16384, 1 at a time, suffix `/no_think`) are kept in the compose dir as `.env.bak-qwen-<date>`; restoring is `cp` of that file + recreate |
| Database | `vani_gtm_db` |
| Runtime DB role | **`vanigtm_app` since 2026-10-02** (NOSUPERUSER, NOBYPASSRLS) — RLS enforced except on the 31 unforced `vani_*`/`vara_*` tables it owns. `DB_MIGRATE` = `vikuna_admin` (owner) for the migration runner only |
| Console | `vani.vikuna.io` (Vercel, VaNiGTM repo, root `vani-app/`); env `NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io` |
| Website | `www.vikuna.io` (Vercel, VaNiGTM repo, root `web/`) |
| Other vhosts on the same nginx | `dristiq.com`, `mcp-db.dristiq.com` (the read-only DB MCP) — not ours to change from here |

### Environment variables (names only — values live on the box)

The full list with comments is `backend/.env.example`. The ones a deploy
touches most:

| Group | Variables |
|---|---|
| Core | `DB_PRIMARY` (runtime role), `DB_MIGRATE` (owner, migrations only — §4b), `DB_PRIMARY_SSL`, `JWT_SECRET`, `PORT`, `NODE_ENV` |
| Secrets | `TENANT_SECRET_KEY` (+ `_PREVIOUS` during rotation) — no default, BYOK refuses to save without it. `SUPPRESSION_HASH_KEY` — no default, ≥32 chars; not needed at startup, but the contact gate refuses everything without it. Never rotate it casually; back it up (a lost key unblocks everyone). `FUNNEL_*` (eight, see `backend/.env.example`) — the website preview before signup; not needed at startup, the preview answers 503 without them. `FUNNEL_GRAPH_MAX_CHUNKS` is required by the preview since 262; `FUNNEL_LEADS_TENANT_SLUG` only by Request access, which answers 503 alone without it |
| LLM — **all required, no defaults** (API and worker refuse to start and list what is missing) | `LLM_PRIMARY_URL`, `LLM_PRIMARY_MODEL`, `LLM_PRIMARY_KEY` (may be empty), `LLM_PRIMARY_TIMEOUT_MS`, `LLM_PRIMARY_SYSTEM_SUFFIX` (may be empty), `LLM_CONTEXT_TOKENS`, `LLM_MAX_CONCURRENT`, `LLM_BYOK_MAX_CONCURRENT`, `LLM_CHARS_PER_TOKEN`, `LLM_TOKENS_PER_SEC`, `HAIKU_DEFAULT`, `ANTHROPIC_API_KEY` (empty = no fallback), `LLM_FAILOVER_MODEL` (required with the key). `docs/llm-config.md` |
| LLM arithmetic — **required** | `LLM_TEMPLATE_OVERHEAD_TOKENS`, `LLM_BUDGET_SLACK_TOKENS`, `LLM_OVERFLOW_MARGIN`, `LLM_CALIBRATION_MIN_SAMPLES`, `LLM_SPEED_MIN_SAMPLE_TOKENS`, `LLM_SPEED_MAX_MULTIPLE`, `LLM_PREFILL_FACTOR`, `LLM_TIMEOUT_SLACK_MS`, `LLM_DEFAULT_MAX_TOKENS`, `LLM_DEFAULT_TEMPERATURE`, `LLM_EXTRACT_ANSWER_DIVISOR/_MIN/_MAX` |
| Worker — **required**, checked at worker start | `WORKER_POLL_MS`, `WORKER_BATCH_SIZE`, `WORKER_HEARTBEAT_MS`, `WORKER_STALE_CLAIM_SECONDS`, `WORKER_MAX_ATTEMPTS` |
| Embeddings (checked at call time) | `EMBED_URL`, `EMBED_MODEL`, `EMBED_TIMEOUT_MS`, `EMBED_DIM`, `EMBED_KEY` |
| Integrations | `SEARXNG_URL`, `N8N_RENDER_URL`, `N8N_RENDER_SECRET`, `N8N_ENV`, `GDRIVE_*` |
| Import pipeline — **required**, checked at API and worker start | `ETL_UPLOAD_MAX_BYTES` (nginx's `/api/v1/etl/upload` location must allow as much — 200m today), `ETL_SYNC_MAX_BYTES`, `ETL_STAGE_CHUNK_ROWS` |
| CORS (dev only) | `CORS_ORIGIN` — comma-separated; production uses nginx instead |

Never commit a value. Never print `.env` into a chat.

## 7. The console (Vercel)

Deploys automatically from `main` of **kamalcharan/VaNiGTM**, project root
`vani-app` (the website: same repo, root `web`). Each project's *Ignored Build
Step* is `git diff --quiet HEAD^ HEAD -- .`, which Vercel runs inside the root
directory, so a commit that touches only `backend/` builds neither. Nothing to
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
