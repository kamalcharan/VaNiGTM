# RLS Cutover Checklist — switch the app from `vikuna_admin` → `vanigtm_app`

> **Status:** DRAFT / artifact. Do **not** execute until after Phase 4.
> **Why:** The app/worker currently connects as `vikuna_admin`
> (`rolsuper=true`, `rolbypassrls=true`), so every RLS policy is bypassed at
> runtime. Tenant isolation rests entirely on the app-layer `WHERE tenant_id`.
> Switching `DB_PRIMARY` to the least-privilege `vanigtm_app`
> (`rolsuper=false`, `rolbypassrls=false`) makes RLS actually enforce, giving
> back the "both layers required" safety net CLAUDE.md mandates.

---

## Pre-flight (no downtime)

- [ ] **Back up first.** `pg_dump` the DB (or take a VPS snapshot). This is a
      privilege change to a live DB.
- [ ] Confirm the two roles exist and their attributes:
      ```sql
      SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
      WHERE rolname IN ('vikuna_admin','vanigtm_app');
      -- expect: vikuna_admin t/t, vanigtm_app f/f
      ```
- [ ] Run the grant script **as `vikuna_admin`** (the owner):
      ```bash
      psql "$DB_PRIMARY_ADMIN" -f scripts/grant-vanigtm-app.sql
      ```
      Review its post-grant output — `vanigtm_app` should show
      SELECT/INSERT/UPDATE/DELETE on the sampled tables and EXECUTE on
      `set_tenant_context`.
- [ ] Prepare a `vanigtm_app` connection string. Keep the `vikuna_admin`
      string as `DB_PRIMARY_ADMIN` — migrations still run as admin.

---

## REQUIRED pre-cutover fixes (code paths that break under `vanigtm_app`)

These are raw-pool, cross-tenant reads that work today only because
`vikuna_admin` bypasses RLS. Under `vanigtm_app` the policy filters all rows
(no `app.current_tenant_id` set). Each must be fixed **before** cutover or the
feature silently returns nothing.

- [ ] **`gt_presentations` public share route breaks under `vanigtm_app`.**
      `GET /share/:token` (storyteller.routes.ts) uses the raw pool with no
      tenant context; once RLS enforces, the policy filters all rows (no
      `app.current_tenant_id` set), so the route returns 404 for every valid
      token.

      Fix options (pick one before cutover):
      - **(a) `SECURITY DEFINER` function** `get_shared_deck(token)` that
        bypasses RLS and returns only approved decks — **preferred**, narrowest
        surface.
      - **(b)** an RLS policy permitting anonymous `SELECT` of `status='approved'`
        rows.
      - **(c)** route share reads through a bypass connection.

      **Recommend (a):** a definer function scoped to
      `WHERE share_token = $1 AND status = 'approved'` is the least-privilege
      option and can't leak `awaiting` decks. After adding it, change the route
      to call the function instead of the inline `SELECT`.

---

## Cutover

- [ ] Edit `backend/.env`: point `DB_PRIMARY` at **`vanigtm_app`**
      (same host/db, different user + password). Leave `DB_PRIMARY_SSL` as-is.
- [ ] **Migrations do NOT run as the app role.** Keep running
      `npm run db:migrate` with the `vikuna_admin` string (so new tables stay
      owned by `vikuna_admin` and inherit the default-privilege grants).
- [ ] Restart **both** processes (env changes need a hard restart —
      `tsx watch` does not reload `.env`):
      ```bash
      # terminal 1
      cd backend && npm run dev
      # terminal 2
      cd backend && npm run worker
      ```
- [ ] Smoke test: log in, load a data page, register a tenant. Watch the
      server/worker logs for any `permission denied for table/sequence` or
      `new row violates row-level security policy` — those mean a missing
      grant or a raw-`pool.query` write that isn't setting tenant context.

---

## Proof: tenant A cannot read tenant B under the app role

This is the acceptance test — it must **pass under `vanigtm_app`** and would
**fail (leak) under `vikuna_admin`**. Run it in `psql` using the **`vanigtm_app`**
connection string.

> `set_tenant_context()` uses `set_config(..., is_local := true)`, so the
> tenant GUC lives only for the current transaction. The test therefore runs
> inside a single `BEGIN … ROLLBACK` block — exactly how `createTenantDb`
> scopes it in the app.

### Setup (as `vikuna_admin`, one-time) — ensure two tenants have data
```sql
-- Note two real tenant_ids that both have rows in gt_kg_nodes (or use
-- gt_tenant_profile). Example uses placeholders:
--   TENANT_A = '...'   TENANT_B = '...'
SELECT tenant_id, count(*) FROM gt_kg_nodes GROUP BY tenant_id ORDER BY 2 DESC;
```

### Test 1 — negative control: no context → zero rows (proves RLS is ON)
```sql
-- connection: vanigtm_app
BEGIN;
  -- no set_tenant_context call
  SELECT count(*) AS should_be_zero FROM gt_kg_nodes;
ROLLBACK;
-- PASS if should_be_zero = 0 (RLS filters everything when context unset).
-- If it returns a non-zero count, RLS is NOT enforcing — STOP and investigate
-- (wrong role? table owned by vanigtm_app? BYPASSRLS still set?).
```

### Test 2 — tenant A sees only A, and cannot read B
```sql
-- connection: vanigtm_app
BEGIN;
  SELECT set_tenant_context('TENANT_A');       -- <-- real tenant A uuid

  -- Should list ONLY tenant A:
  SELECT DISTINCT tenant_id FROM gt_kg_nodes;

  -- Direct attempt to read tenant B's rows → must be 0:
  SELECT count(*) AS b_rows_visible_to_a
  FROM gt_kg_nodes
  WHERE tenant_id = 'TENANT_B';                -- <-- real tenant B uuid
ROLLBACK;
-- PASS if: DISTINCT tenant_id shows only TENANT_A, AND
--          b_rows_visible_to_a = 0  (even though B has rows).
```

### Test 3 — contrast (optional, proves the fix mattered)
```sql
-- Run Test 2 again but on the vikuna_admin connection.
-- EXPECT the leak: b_rows_visible_to_a > 0 and DISTINCT shows both tenants,
-- because vikuna_admin bypasses RLS. This is the "before" state we're fixing.
```

- [ ] Test 1 returns `0`.
- [ ] Test 2 shows only tenant A and `b_rows_visible_to_a = 0`.
- [ ] (Optional) Test 3 leaks under `vikuna_admin`, confirming RLS is what
      makes the difference.

---

## Rollback (if anything breaks)

- [ ] Revert `DB_PRIMARY` in `backend/.env` back to the `vikuna_admin` string.
- [ ] Restart server + worker.
- [ ] App returns to previous (RLS-bypassed) behaviour. The grants added to
      `vanigtm_app` are harmless to leave in place for the next attempt.

---

## Follow-ups once green

- [ ] Enforcement discipline: every **new** agent that writes to an
      RLS-enabled table must go through `createTenantDb` (sets context).
      Raw `pool.query` writes only remain valid for tables `vanigtm_app`
      owns (`gt_agent_runs`) or where RLS is disabled by design (`gt_events`).
- [ ] Consider `ALTER TABLE … FORCE ROW LEVEL SECURITY` on tenant tables so
      even a future owner-role mistake can't silently bypass RLS. (Would
      require the `gt_agent_runs` runner + `gt_events` poll to keep their
      current owner/disabled arrangement.)
- [ ] Remove Phase 3 diagnostic logs and rotate the `vanigtm_app` password
      out of any shared notes.
