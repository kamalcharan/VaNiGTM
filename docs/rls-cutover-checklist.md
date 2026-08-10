# RLS Cutover Checklist — switch the app from `vikuna_admin` → `vanigtm_app`

> **Status: EXECUTED on production, 2026-08-10.** `DB_PRIMARY` points at
> `vanigtm_app` and login has been confirmed working under it. This is no
> longer a draft — it is the record of a cutover that happened, kept for the
> remaining verification (below), for other environments, and for the rollback.
>
> **Why:** the app/worker used to connect as `vikuna_admin`
> (`rolsuper=true`, `rolbypassrls=true`), so every RLS policy was bypassed at
> runtime and tenant isolation rested entirely on the app-layer
> `WHERE tenant_id`. `vanigtm_app` (`rolsuper=false`, `rolbypassrls=false`)
> makes RLS actually enforce, giving back the "both layers required" safety net
> CLAUDE.md mandates.
>
> **Still outstanding after the switch:** re-run
> `deploy/vani-main-vps/rls-two-tenant-test.sql` under the restricted role, and
> exercise **signup**, the **assessment flow** and the **skills executor**.
> Login is done. Those three have still never run as `vanigtm_app`.

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
- [ ] **Give `vanigtm_app` a password, and prove it before you need it.**
      This step was missing until 2026-08-10 and cost a blocked morning.
      `scripts/grant-vanigtm-app.sql` does **not** create the role or set a
      password — it only issues GRANTs, and refuses to run if the role is
      absent. Nothing else in this repo sets one either, so the role can exist,
      be correctly configured, and still be unable to log in.

      Check what it actually has:
      ```sql
      SELECT rolname, rolcanlogin, rolvaliduntil FROM pg_roles
       WHERE rolname = 'vanigtm_app';
      SELECT rolname, rolpassword IS NOT NULL AS has_password,
             left(rolpassword, 14)            AS hash_kind
        FROM pg_authid WHERE rolname = 'vanigtm_app';
      ```
      `rolcanlogin` must be true, `rolvaliduntil` null or in the future, and
      `hash_kind` must match what `pg_hba.conf` demands.

      **The encryption trap.** If `password_encryption` is `md5` while
      `pg_hba.conf` requires `scram-sha-256` (or the reverse), setting a
      password stores a hash the server will not accept — and the failure is
      `28P01 invalid_password`, indistinguishable from typing it wrong. Pin it
      in the same session:
      ```sql
      SHOW password_encryption;
      SELECT line_number, type, database, user_name, address, auth_method
        FROM pg_hba_file_rules ORDER BY line_number;

      SET password_encryption = 'scram-sha-256';   -- match pg_hba
      ALTER ROLE vanigtm_app WITH LOGIN PASSWORD '<strong password>';
      ```

- [ ] Prepare a `vanigtm_app` connection string. Keep the `vikuna_admin`
      string as `DB_PRIMARY_ADMIN` — migrations still run as admin.

- [ ] **Test the connection string before it goes anywhere near `.env`.**
      `DB_PRIMARY` is parsed as a URI (`backend/src/db/pool.ts`), so any of
      `@ : / ? # [ ] %` in the password must be percent-encoded or the parse
      splits in the wrong place — which also surfaces as `28P01`, with a
      perfectly correct password. From the machine that runs the backend:
      ```bash
      psql "postgresql://vanigtm_app:<encoded-pw>@<host>:5432/vani_gtm_db?sslmode=require" \
           -c "SELECT current_database(), current_user"
      ```
      Only when this returns `vanigtm_app` should the string go into `.env`.

---

## Reading a failure at cutover

Two error codes, two completely different problems. Telling them apart first
saves an hour of looking in the wrong place:

| Code | Means | Look at |
|---|---|---|
| `28P01` `invalid_password` | a `pg_hba.conf` rule **matched** and the password check failed | the password, its encryption, and URI escaping — pre-flight above |
| `28000` `invalid_authorization_specification` | **no** `pg_hba.conf` rule matched this host/user/database | `pg_hba_file_rules`, then reload |

And one that looks like RLS but is not. If login returns *"Invalid email or
password"* **with an attempt counter** (`N attempt(s) remaining`), the lookup
on `vn_users` **succeeded** — `login.service.ts` only reaches the counter after
finding the row, passing `is_active`, and passing the lockout check. RLS
blocking the lookup returns zero rows and a message with **no** counter. So a
counter means reads *and* writes on `vn_users` are working under the restricted
role, and the failure is `bcrypt.compare`, not the cutover.

When that happens, the likely cause is one the auth code has independently:
`login.service.ts` looks up `WHERE LOWER(u.email) = $1` with **no tenant
filter** and takes `rows[0]`. If the same email exists under two tenants, which
row you get is not stable — every failed attempt updates
`failed_login_count`, rewriting the tuple and moving it, so a sequential scan
can return the other row next time. `seed-owner.ts` refuses to run in this
situation for exactly this reason. Check for it before suspecting anything else:

```sql
SELECT count(*) OVER () AS rows_for_this_email,
       id, tenant_id, is_active, failed_login_count,
       length(password_hash) AS hash_len, left(password_hash, 4) AS hash_prefix
  FROM vn_users WHERE lower(email) = lower('<email>');
```

`hash_len` must be 60 and `hash_prefix` one of `$2a$` / `$2b$` / `$2y$`.
Clear a burnt counter with:

```sql
UPDATE vn_users SET failed_login_count = 0, locked_until = NULL, updated_at = now()
 WHERE lower(email) = lower('<email>');
```

**For the record: the `vn_*` auth tables carry no RLS at all.** No migration in
this repo enables it on `vn_users`, and migration 236 could not have — its
selection is `WHERE c.relrowsecurity AND NOT c.relforcerowsecurity AND
owner <> 'vikuna_admin'`, so a table with RLS off is invisible to it. This is
deliberate and registered in `docs/db/rls-status.md` §9: authentication must
resolve which tenant a user belongs to *before* a tenant context can exist, so
scoping those tables is circular. Login failing after the cutover is therefore
never an RLS problem — check it against this section, not against the policies.

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
