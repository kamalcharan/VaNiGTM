@AGENTS.md

# vani-app — non-negotiables

These are not style preferences. Each one is here because its absence has
already cost something, or because breaking it costs data.

---

## 1. Every screen carries the same five

A screen is not done until all five are handled. Four of them are handled *for*
you — reach for the helper rather than hand-rolling the state, because
hand-rolled states are how screens end up disagreeing with each other.

| State | How |
|---|---|
| **Loading** | `<DataBoundary skeleton={…}>`. Route-level fallback already exists at `app/(console)/loading.tsx` |
| **Error** | `<DataBoundary>` — includes the retry button and shows the server's own message |
| **Empty** | `<DataBoundary isEmpty={…} empty="…">`. "No data" and "not loaded" must never look alike |
| **Content** | the `children` render prop |
| **Outcome** | `useToast()` — every write says something, success or failure |

```tsx
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';

<DataBoundary
  query={q}
  label="agents"                       // used in every state's copy
  skeleton={<SkeletonRows rows={4} />}  // shape-matched, so nothing jumps
  isEmpty={(d) => !d?.agents?.length}
  empty="Agents appear here once registered."
>
  {(d) => d.agents.map(…)}
</DataBoundary>
```

**Why a boundary and not four `if`s:** `success: false` arrives with **HTTP
200**. The transport wraps every skill call in `{ success, data, error }`, so a
skill can refuse while the request itself is fine. Checking only `isError`
renders an empty screen and calls it success. The boundary checks both. So
must anything that does not use it.

Loaders come in three kinds, and picking the wrong one is a real defect:

- **Known shape** (list, table, counters) → `Skeleton*`. No layout jump.
- **Action in flight** (a button working) → `Spinner` / `InlineLoader`.
- **First paint of a route** → `VaniLoader`.

`FullPageLoader`, `InlineLoader` and their `sm | md | lg` sizes are
**API-identical to VaNiGTM's `frontend/src/components/loader.tsx`**, and
`VaniLoader` mirrors `VdfLoader`. Keep them that way — code moves between these
repos, and a diverged signature turns a copy-paste into a debugging session.
`useToast().showToast({ message, type, duration, dismissible })` matches
VaNiGTM's toast for the same reason.

Never `console.log` an error and move on. A silent failure is worse than a loud
one: users resolve silence by clicking again, and that is how duplicate writes
get made.

---

## 2. Writes go through `useSkillMutation`. Always.

`useSkillQuery` reads; **anything that changes state** uses `useSkillMutation`,
which supplies four guarantees you would otherwise have to remember every time:

1. **No double submit** — refused at a ref, not at `isPending` state. Two calls
   in the same tick both read stale state; a ref does not. Disabling the button
   is a courtesy, not the guarantee.
2. **Idempotency key** — one key per logical attempt, reused across retries of
   that attempt, sent as `Idempotency-Key`.
3. **No stale writes** — a response arriving after a newer attempt started, or
   after unmount, is dropped. Late responses silently resurrect old state.
4. **It always says something** — success and failure both raise a toast.

### Idempotency — enforce it on BOTH sides

We own the UI and the backend. A write path is **not finished** until both
halves exist:

- **Client** — `useSkillMutation` mints one key per logical attempt, reuses it
  across retries of that attempt, and sends it as `Idempotency-Key`. Free; you
  get it by using the hook.
- **Server** — the handler in VaNiGTM must **store the key with its result and
  replay that result** on a repeat, inside the same transaction as the write.
  Not a uniqueness check bolted on afterwards: store-and-replay, so the second
  call returns the first call's answer rather than a conflict error.

Do not ship a write endpoint with only the client half. A key that nothing
honours is worse than no key, because the UI then looks safe to retry when it
is not. If you are adding a write, the backend change lands in the same slice.

**Current state:** the client half is in; **VaNiGTM does not honour the header
on any endpoint yet.** So until the first server-side implementation lands,
still do not tell a user a write is safe to retry, and do not auto-retry.
Retrofitting the existing write paths is tracked in the build plan.

### Two-phase commit — enforce it in the database

Multi-step writes that must not half-apply are **one transaction in VaNiGTM**.
`BEGIN`, all of it, `COMMIT`. The UI cannot make two HTTP calls atomic, so it
must never be asked to: if a flow needs four things to happen together, that is
one endpoint and one transaction, not four calls the UI sequences.

When you are writing the backend:
- One endpoint per atomic outcome. Do not expose the steps separately and hope
  the client calls them in order.
- Use `withTenantClient` so `set_config(..., is_local := true)` stays inside the
  transaction — it is transaction-scoped on purpose and survives pgBouncer
  transaction pooling.
- Where a genuine two-phase shape is needed (an external system in the middle),
  model it explicitly: a **prepare** call that stages and returns something
  inspectable, then a **confirm** call that commits. Staged rows carry their own
  status; they are never visible as committed.

When you are writing the UI:
- Never report success until the whole operation confirms. A per-step toast
  during a multi-step write reads as a commit that has not happened.
- Show what is about to happen before it happens, wherever prepare → confirm
  applies.
- If a step fails mid-flow, say precisely what did and did not happen. "Failed"
  after three of five steps sends people looking in the wrong place.

---

## 3. Race conditions

Assume every response can arrive late, out of order, or after the user has
moved on.

- **Queries** — TanStack Query keys by `['skill', skill, fn, params]` and
  discards superseded results. Do not bypass it with a bare `fetch` in an
  effect; that is the pattern with no ordering guarantee at all.
- **Mutations** — guaranteed by `useSkillMutation` (above).
- **Effects that set state** — check a mounted ref, or use the query layer.
- **Auth bootstrap** — `RequireSession` waits for `isLoading` to clear before
  deciding. Redirecting on `!isAuthenticated` alone bounces a signed-in user to
  `/login` on every reload, because the silent refresh has not resolved yet.
- **Anything server-rendered** — no `Math.random()` and no `Date.now()` in
  render. Server and client must agree or hydration breaks. Skeleton widths
  vary by index for exactly this reason.

---

## 4. The database is not yours to extend

**No new tables, columns, enums or indexes without Charan's explicit approval.**
Not "it's only one column". Not a helper table. Not a cache table.

Use what the specs and the running system already define:

- `docs/vani/sql/001_vani_platform.sql` — the 16 `vani_` platform tables
- `docs/vani/sql/002_vara_agent.sql` — Vara's `vara_` tables
- `docs/vani/sql/003_vara_learning_functions_seed.sql` — calibration, the
  guarded `vara_transition()`, DPDP purge, seed
- `docs/vani/vara-data-model-v1.0.html` — the authoritative model
- VaNiGTM's `vn_*` tables — the running application schema

If the model does not support what you are building, that is a **schema change
request**: state what is missing and why the existing model cannot carry it,
then wait. Do not work around it with a column, and do not work around it by
stuffing structured data into an existing JSONB field either — that is a schema
change wearing a disguise.

Invariants that outrank any convenience, from the platform spec:

- **Agents extend, never modify.** `vani_` tables never grow agent-specific
  columns. An agent ships its own prefixed tables plus registry declarations.
- **`model` is never a legal audit actor.** `actor_type` is
  `human | rule | timer | system`, enforced in the database. Rules close only on
  knockouts; timers expire only closing windows; system routes but never decides.
- **Append-only** for audit, comms log, metering and pack versions. The DPDP
  purge function is the single sanctioned bypass, and it audits itself.
- **Audit payloads reference ids, never raw PII** — that is what lets a purge
  leave the audit spine intact.
- **One declaration, N projections.** A tenant states a fact once at the
  platform; agents receive a delegation and never re-ask.

There is no live database access from a Claude session — `.mcp.json` configures
`gtm-postgres` but `GTM_MCP_BASIC` has never been set. Every schema claim must
be traced to a migration file or the spec, never to memory or a guess.

---

## 5. The registry boundary

Adding a skill or agent is **one folder under `src/skills/` and one line in
`src/skills/index.ts`**. If it needs an edit inside `src/platform/`, that is a
platform change request — logged and decided, not worked around. This is the UI
expression of "agents extend, never modify", and it is the stated test of the
integration contract.

---

## 6. Auth surface

- Access token **in memory only** — never `localStorage`, never a readable
  cookie.
- Refresh token is an httpOnly cookie the app never reads.
- Calls go **direct to `api.vikuna.io`** with `credentials: 'include'`. Do not
  proxy through Vercel: it replaces the browser origin and defeats the nginx
  origin allowlist.
- Response envelopes are `{ tokens: { access_token } }` and
  `{ error: { code, message } }`. Read them through `readAccessToken()` and
  `readError()`; both shapes have already been got wrong once, silently.
- Auth is the **only** non-generic surface. No skill gets its own REST endpoint.
- Sign-in errors stay generic. Distinguishing "no such user" from "wrong
  password" is how account enumeration starts.
- The signup gate in `lib/gate.ts` is a **front door, not a lock** — client-side,
  and `/api/v1/auth/register` is open on the API regardless. Do not describe it
  as access control.
