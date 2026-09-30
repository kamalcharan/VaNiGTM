# POA — One repository: UI and API together · 2026-09-30

> Companion to `POA-2026-09-30-platform.md`; this is its Track H. Charan,
> 2026-09-30: "UX layer and backend layer will have to be merged into a
> single repository … VaNiGTM UI layer will have to be cleaned."
>
> Facts checked in code on 2026-09-30. Nothing here has been started.

## 0. What is where today, and why it costs

```
kamalcharan/VaNiGTM            kamalcharan/vikunawebsite
├── backend/      682 files    ├── src/ + public/     100 files   Vite marketing site → www.vikuna.io (Vercel)
├── frontend/     381 files    ├── vani-app/          336 files   Next.js console   → vani.vikuna.io (Vercel, root dir vani-app)
│   RETIRED 2026-09-16,        ├── vanigtm/                       git submodule → VaNiGTM, pinned at an old commit
│   still builds, not run      └── docs/vani/          19 files   product specs (Vara, platform, runbooks)
├── deploy/  (ProKey per-customer compose: backend + frontend + nginx)
├── deploy/vani-main-vps/  (the real deploy: backend only → api.vikuna.io)
└── documents/, docs/
```

What the split costs, seen this fortnight:

- **Two `main`s that disagree.** The console on Vercel calls four API paths
  that exist only on an unmerged VaNiGTM branch (HANDOVER §2.0). One repo
  would have made that a failing build, not a live defect.
- **Three checkouts on one laptop** (`OpenClaw\VaNiGTM`, `website\
  vikunawebsite-git` with the submodule, the VPS checkout), and every
  session has to say which one it means.
- **A feature is two commits in two repos** with no atomic link; the
  `vanigtm/` submodule pointer was bumped by hand and is now stale.
- **Handover lives in two files** that point at each other.
- **381 files of retired UI** still shape the root: `package.json` scripts
  run it, `tsconfig.json` includes it, root `dependencies` carry Next and
  React for it, `build-push.sh` builds it, `deploy/docker-compose.yml` and
  `deploy/nginx.conf` serve it.

## 1. Target

```
kamalcharan/VaNiGTM                       (rename to "vani" is optional and separate — see D4)
├── backend/            Express API + worker           → VPS   (unchanged deploy)
├── vani-app/           Next.js console                → Vercel, project re-pointed at this repo, root dir vani-app
├── deploy/             vani-main-vps only; the ProKey compose retired or moved (D2)
├── documents/, docs/   one set; vikunawebsite's docs/vani/ folded in
├── ARCH.md · AGENTS.md · CLAUDE.md   one product CLAUDE.md; vani-app/CLAUDE.md stays as the UI standard
└── HANDOVER.md         one

kamalcharan/vikunawebsite                 marketing site only: src/, public/, api/, vercel.json
                                          no submodule, no product docs, no console
```

Rules that carry over unchanged: `vani-app/CLAUDE.md` §5 (registry boundary),
its five states and `useSkillMutation`; everything in ARCH.md once written.

## 2. Decisions

| # | Decision | Default |
|---|---|---|
| D1 | Preserve `vani-app` history in the move (filter-repo extract + merge) or squash-import | Preserve. 87 commits of design rulings live in those messages |
| D2 | `deploy/` ProKey compose (backend + frontend + nginx, `vikuna/prokey-*` images): still used by any customer instance? | If no ProKey instance runs it: delete with `frontend/`. If yes: move to `deploy/prokey/` frozen, with a note that its frontend image is the retired UI |
| D3 | Salvage list from `frontend/` (§4) — port or drop, item by item | Port the four named; drop the rest |
| D4 | Rename the repo `VaNiGTM` → `vani` | Not now. GitHub redirects old names, but the VPS checkout path, `deploy-vani.sh`, and every doc mention it. Do it as its own one-line change after the move, or never |
| D5 | Freeze window for console work while the move lands | One day, announced; any in-flight `vani-app` branch is rebased onto the new location by the person who owns it |

## 3. Phases

### H0 — Before touching anything

- **B1 first.** Merge `claude/session-setup-qrxev9` into VaNiGTM `main`
  (platform POA Track B) so the console and the API agree BEFORE they share a
  repo. Otherwise the first CI run in the merged repo is red for a reason that
  predates the merge.
- Tag both repos: `pre-consolidation-2026-xx-xx`. The retired `frontend/`
  stays reachable at that tag forever; nothing needs to be "kept for
  reference" on disk.
- Salvage inventory (§4) written into this file with a decision per item.

### H1 — Move the console (one day, mechanical)

1. In a clone of vikunawebsite: `git filter-repo --subdirectory-filter vani-app --path-rename :vani-app/` (keeps only vani-app history, at path `vani-app/`).
2. In VaNiGTM: `git remote add console <that clone>`; `git merge --allow-unrelated-histories console/main`. No conflicts are possible: the path is new.
3. Also carry `docs/vani/` from vikunawebsite into `VaNiGTM/documents/vani/` in the same merge (a second filter-repo pass, or a plain copy with a commit that names the source SHA).
4. Root hygiene in the same PR: `vani-app/` has its own lockfile and tsconfig and imports nothing outside itself (checked: no `../../` beyond `src/`), so the root `package.json` gets **no** workspace wiring. Root scripts become `dev:api`, `dev:worker`, `dev:ui`, `dev:all`; `install:all` covers backend and vani-app.
5. `.github/workflows/` (neither repo has one today): add one that runs `backend` tests and `vani-app` `next build` on every PR. This is the check the split repos never had.
6. CLAUDE.md: rewrite the Architecture section (the UI is `vani-app/` here), delete every "in the OTHER repo" sentence, keep `vani-app/CLAUDE.md` as the mandatory UI read. HANDOVER: one file; vikunawebsite's `docs/VANI_AI_HANDOVER.md` becomes a two-line pointer.

### H2 — Re-point Vercel (thirty minutes, plus DNS caution)

1. Vercel: create the project from VaNiGTM with Root Directory `vani-app` (or re-link the existing `vani-iota` project to the new repo — re-linking keeps the domain and env vars; prefer it).
2. Env vars: `NEXT_PUBLIC_API_ORIGIN` and the rest re-entered if a new project.
3. Ignored Build Step: `git diff --quiet HEAD^ HEAD -- vani-app/` so backend-only commits do not rebuild the console.
4. `vani.vikuna.io` stays on the same project. Nothing on the VPS changes: CORS and nginx already name the domain, not the repo.
5. Verify: a console commit deploys; a backend-only commit does not; `/login` → `/dashboard` works against `api.vikuna.io`.

### H3 — Retire the old UI and clean the root (half a day)

Delete `frontend/` (381 files). Then, in the same PR:

| File | Change |
|---|---|
| `package.json` (root) | remove `dev`, `dev:frontend`, `build:frontend`, `test:frontend`; remove root `dependencies` `next`, `react`, `react-dom` (they exist only for the retired UI; vani-app has its own); `build` = backend only |
| `tsconfig.json` (root) | drop `frontend` from `include` |
| `Dockerfile` (root) | header comment; if it only documents the two images, delete the file (the real Dockerfile is `deploy/vani-main-vps/Dockerfile`) |
| `build-push.sh` | remove the frontend half, or the whole script per D2 |
| `deploy/docker-compose.yml`, `deploy/nginx.conf`, `deploy/update.sh`, `deploy/configure.sh` | per D2 |
| `CLAUDE.md` | remove the "Frontend conventions — RETIRED APP" section; keep the two lines that still describe the API contract (dates `DD-MMM-YYYY`, token names) by moving them to ARCH.md |
| `documents/design-notes-smartprofile-port.md`, HANDOVER | paths that say `frontend/…` become "retired, see tag" |

`documents/gtm-engine-ui/` and `documents/ux-references/` stay: they are
blueprints, not code.

### H4 — Slim vikunawebsite (half a day)

- Remove the `vanigtm/` submodule (`.gitmodules`, the gitlink) and `docs/vani/`.
- `vercel.json`: the `/vani → vani.vikuna.io` redirect stays.
- Its CLAUDE.md: delete the "VaNi AI" and "Scope discipline for VaNi work" sections; one line says the product lives in VaNiGTM.
- The website keeps its own Vercel project; nothing else changes.

### H5 — Charan's laptop

Retire `website\vikunawebsite-git`'s role as a product checkout. One product
checkout (`OpenClaw\VaNiGTM`), one website checkout, one VPS checkout. Record
in HANDOVER §4.

## 4. Salvage inventory — `frontend/` things vani-app does not have

From the 2026-09-30 side-by-side (HANDOVER-adjacent audit). Decide each
before H3 deletes the source.

| Item in `frontend/` | vani-app today | Default |
|---|---|---|
| `/today` Brain-completeness card: weakest section by weight, "Fix X", unlock at 60 | Dashboard is fixtures | **Port** (platform POA B4). ~150 lines of logic; the ring component maps to `platform/vdf` |
| `components/today/AttentionQueue.tsx` (680 lines; `attention-skill.get_attention` / `decide_attention`, snooze, dismiss, reopen, log touch) | Nothing; the skill exists on the API | **Port**, into `gtm-today` (it already has the route) |
| `PulseWidget` + `/pulses` (`pulse-skill`) | Nothing | **Port** as a dashboard widget; the skill is live |
| `/today/storyteller` (deck generation, share token, Q&A) | Nothing; `storyteller-skill` is live on the API | **Port** later, under GTM's story library; record as G-track story |
| `/war-room/agent-runs`, `/war-room/analytics` | `/runs` is a fixture | Runs: superseded by platform POA B3. Analytics: **drop**; `gtm-analytics-skill` gets a surface when GTM needs it |
| `/import`, `/import-dashboard`, `/common-pool` | Already re-built as `gtm-imports`, `gtm-pool` this fortnight | **Drop** |
| `/gtm/audience/*`, `/gtm/journeys`, `/gtm/motion`, `/gtm/people` | Re-built as `gtm-audience`, `gtm-journeys`, `gtm-motion`, `gtm-people` | **Drop**; diff each once for lost affordances before deleting |
| `/brain/teach`, `/brain/knowledge`, `/brain/offers` | `smart-profile/knowledge`, `/offers` | **Drop** |
| `(public)/deck/[token]` share page | Nothing | **Port** with the storyteller item |
| `(public)/design/*` gallery, `/dev-colors`, `/smoketest`, `/demo-data` | — | **Drop** |
| `(vani)/a/[slug]`, `(vani)/r/[token]` — the VaNi AI public assessment flow and report | Nothing in vani-app; the API routes are live (`/assessment`, `/r/:token`) | **Decide with Charan.** It is the funnel pattern Track E reuses (anonymous token → teaser → capture). Port the flow into vani-app under `(public)` before deleting, or accept that the assessment funnel goes dark |
| VDF component library (`components/vdf/*`) | `platform/vdf/` re-implemented the ones the wizard needed | **Drop** the rest; port on demand |

## 5. Order and duration

```
H0  after B1 lands                     tags + salvage decisions          ½ day
H1  next day (freeze window, D5)       move + docs + CI                  1 day
H2  same day                           Vercel re-point + verify          ½ day
H3  following day                      delete frontend/, clean root      ½ day
H4  same day                           slim the website repo             ½ day
H5  whenever Charan is at the laptop   one checkout                      —
```

Three days of calendar, one of real work. Do it in week 1 of the platform
POA, after B1 and before any Track C or D code, so nothing built afterwards
has to move.

## 6. Done when

- `git clone VaNiGTM && npm run install:all && npm run dev:all` brings up API,
  worker and console on one machine with one `.env` story.
- A PR that changes a skill function and its screen is ONE PR, and CI runs
  both halves.
- `vani.vikuna.io` deploys from VaNiGTM `main`; a backend-only commit does not
  rebuild it.
- `frontend/` is gone; `grep -r frontend` at the root finds only the
  retirement tag in docs.
- vikunawebsite has no submodule and no product docs.
- HANDOVER.md is one file in one repo.
