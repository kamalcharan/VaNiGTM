# VaNi AI — Main VPS deploy runbook

For Charan to run. Every command below runs ON THE MAIN VPS (or against it)
— nothing here executes automatically; this session cannot reach the VPS
(confirmed again in Task A1: 5432 times out, HTTP egress blocked). Paste
output back for debugging if any step fails.

Everything referenced (`Dockerfile`, `docker-compose.vani.yml`,
`api.vikuna.io.conf`, `vani-cors.conf`, `.env.example`) lives in
`deploy/vani-main-vps/` on branch `claude/vani-ai-assessment-skill`. Pull
that branch onto the VPS (or merge it to `main` first, your call) before
starting.

## 0. Prerequisites — do these before anything else

1. **Add swap.** Agent Topology v1.1 §6.1, stated as a hard rule: *"At zero
   swap on 8 GB, 'tight' becomes 'OOM-killed' with no warning — and
   Postgres is the process most likely to be killed."* This VPS has zero
   swap today. Adding ~2-4GB of swap costs nothing and removes the single
   biggest risk of this deploy. Standard approach (adjust size to taste):
   ```
   fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```
2. **Confirm the shared Docker network name.**
   ```
   docker inspect vikuna-nginx --format '{{json .NetworkSettings.Networks}}'
   ```
   Put the result into `.env` as `NETWORK_NAME=`.
3. **Confirm DNS**: `api.vikuna.io` must resolve to this VPS's IP before
   certbot (step 6) can issue a cert. HTTP-only (port 80) works without
   this for steps 1-5, but the smoke test's HTTPS calls (step 7) need it.
4. Copy `.env.example` to `.env` in this directory and fill in real values
   — `DB_PRIMARY` (same `vani_gtm_db`, not a new database),
   `JWT_SECRET` (**the existing value already in use** — do not generate a
   new one, that invalidates every current session), `NETWORK_NAME` from
   step 2.

## 1. Backup FIRST

```
docker exec vikuna-postgres pg_dump -U <db_user> -Fc vani_gtm_db > vani_gtm_db_pre_vani_$(date +%Y%m%d_%H%M%S).dump
```
Confirm the file is non-trivial in size before proceeding
(`ls -lh vani_gtm_db_pre_vani_*.dump`). This is the "and restore" half of
the rollback section below — keep it somewhere off this VPS too.

## 2. Build the backend image

```
cd VaNiGTM   # wherever you cloned/pulled it
docker build -f deploy/vani-main-vps/Dockerfile -t vani-backend:latest backend/
```

## 3. Start the service

```
cd deploy/vani-main-vps
docker compose \
  -f <path-to-your-existing-main-vps-compose>.yml \
  -f docker-compose.vani.yml \
  up -d vani-backend
docker logs -f vani-backend   # watch it come up; Ctrl-C once healthy
```
`docker ps` should show `vani-backend` as `healthy` within ~15-45s
(HEALTHCHECK start_period 15s, interval 30s).

## 4. Apply migrations 228 and 229

Compiled JS is baked into the image (`dist/migrate.js`) — no `tsx`/dev
dependency needed at runtime:
```
docker exec vani-backend node dist/migrate.js
```
Expect to see `228_gt_assessment.sql` and `229_gt_report_top_modes.sql`
apply (in that order — 229 depends on `gt_report` existing). If ANY other
migration numbers show as pending, stop and report back before continuing —
that means this VPS's `vani_gtm_db` has drifted from what Task A1 tested
against, and applying 228/229 on top of an unknown base is not safe to
just proceed through.

## 5. Seed the `ai-recovery` definition

```
docker exec vani-backend node dist/skills/assessment-skill/seed-definition.js
```
Idempotent — safe to re-run. Expect
`✓ Seeded ai-recovery v1.0.0 (id=...)`, or `already seeded — nothing to do`
if you'd already run it.

## 6. Deploy the Nginx config

```
# Copy both files into whatever host directory is bind-mounted to
# vikuna-nginx's /etc/nginx/conf.d/ and /etc/nginx/snippets/ — confirm the
# real mount paths with:
docker inspect vikuna-nginx --format '{{json .Mounts}}'

cp deploy/vani-main-vps/api.vikuna.io.conf  <that conf.d mount>/
cp deploy/vani-main-vps/vani-cors.conf      <that snippets mount>/   # or conf.d/, adjust the `include` path in api.vikuna.io.conf to match

docker exec vikuna-nginx nginx -t          # syntax check BEFORE reload
docker exec vikuna-nginx nginx -s reload
```
Once DNS (prereq 3) resolves and you're ready for HTTPS:
```
certbot --nginx -d api.vikuna.io
```
(or however this VPS already issues certs for its other vhosts — I don't
know that tooling, only that `CLAUDE.md` noted no cert existed yet for
Nginx as of the last inspection.)

## 7. Verify

```
./smoke-test.sh https://api.vikuna.io
```
(or `http://<vps-ip>` before DNS/cert exist — see the script's own usage
note). All checks should print PASS. See `smoke-test.sh` in this directory.

---

## Rollback

**Scoped rollback (fast, no data loss beyond VaNi AI's own new tables):**
```sql
-- Run against vani_gtm_db, e.g. via:
-- docker exec -i vikuna-postgres psql -U <db_user> -d vani_gtm_db

BEGIN;
ALTER TABLE gt_report DROP COLUMN IF EXISTS top_modes;   -- undoes 229
DROP TABLE IF EXISTS gt_lead_event;
DROP TABLE IF EXISTS gt_report;
DROP TABLE IF EXISTS gt_assessment_response;
DROP TABLE IF EXISTS gt_lead;
DROP TABLE IF EXISTS gt_assessment_def;
DROP TABLE IF EXISTS gt_partner;
DELETE FROM vn_migrations WHERE filename IN ('228_gt_assessment.sql', '229_gt_report_top_modes.sql');
-- The Vikuna Consulting tenant row (vn_tenants, slug='vikuna-consulting')
-- is intentionally NOT dropped here — check first whether anything else
-- got created under it before deciding to remove it:
--   SELECT count(*) FROM vn_users WHERE tenant_id = (SELECT id FROM vn_tenants WHERE slug='vikuna-consulting');
-- If zero, safe to also:
--   DELETE FROM vn_tenants WHERE slug = 'vikuna-consulting';
COMMIT;
```
Then stop the container: `docker compose -f ... -f docker-compose.vani.yml stop vani-backend` and remove the nginx conf files copied in step 6 (`nginx -s reload` again after removing).

**Full restore (nuclear option — use if the scoped rollback above isn't enough, e.g. something else already wrote data you need back):**
```
docker exec -i vikuna-postgres pg_restore -U <db_user> -d vani_gtm_db --clean --if-exists < vani_gtm_db_pre_vani_<timestamp>.dump
```
This restores the ENTIRE database to its pre-deploy state, not just VaNi
AI's tables — only reach for this if the scoped rollback genuinely isn't
sufficient, since it also reverts anything else that changed on this
database since the backup.

---

## What I had to guess (confirm/correct before applying)

- **Shared Docker network name** — I don't know it; `docker-compose.vani.yml` has a placeholder (`NETWORK_NAME` in `.env`).
- **Whether the Main VPS builds images locally or pulls from a registry** — I assumed local build (no registry credentials needed); ProKey's convention (Docker Hub, `vikuna/prokey-backend`) may or may not be what the other Main VPS containers actually follow.
- **vikuna-nginx's config layout** — assumed standard `nginx:alpine` with a bind-mounted `conf.d/` directory scanned via `include`. If it's configured differently, the *content* of `api.vikuna.io.conf`/`vani-cors.conf` should still be correct; only the drop-in mechanics (step 6) would need adjusting.
- **SSL/certbot tooling** — assumed standard `certbot --nginx`; this VPS may already have its own cert-issuance process for other vhosts that I don't know about.
- **Vercel preview origin pattern** — guessed `https://vikunawebsite-<anything>.vercel.app` (Vercel's default naming, and this repo's actual name). Confirm against a real preview deploy URL and tighten/widen the regex in `api.vikuna.io.conf` if it doesn't match.
- **`pg_dump`/`psql` invocation** — assumed a `<db_user>` credential exists inside/reachable from the `vikuna-postgres` container the same way the rest of this stack already uses it; I don't have that value.

Stopping here — this is Task A2 complete. Paste back output from any step
that doesn't match what's expected above.
