# POA — One repository: website, console and API together · 2026-09-30

> Companion to `POA-2026-09-30-platform.md`; this is its Track H.
>
> **Corrected 2026-09-30 (Charan).** The first version of this plan moved only
> `vani-app/` into VaNiGTM and left the website in its own repo. That was a
> misreading. The ruling:
>
> > VaNiGTM already has a frontend — we are not going to use it. vani-app is
> > currently in the website repo. We have to clean up VaNiGTM's frontend so
> > there are no references going forward. web (web + vani-app) + VaNiGTM
> > (backend) can be part of a single repository — currently they are two.
>
> So: **one repository holding the website, the console and the API**, and the
> retired `frontend/` removed with every reference to it.
>
> Facts checked in code on 2026-09-30. Nothing here has been started.

## 0. What is where today

```
kamalcharan/VaNiGTM                      kamalcharan/vikunawebsite  (122 commits)
├── backend/      API + worker → VPS     ├── src/ public/ api/ index.html   Vite site → www.vikuna.io (Vercel)
├── frontend/     RETIRED 2026-09-16,    │   vercel.json (functions, headers, rewrites, redirects)
│                 never deployed         ├── vani-app/        Next.js console → vani.vikuna.io (Vercel, root dir vani-app; 46 commits)
├── deploy/       ProKey compose (uses   ├── vanigtm/         git submodule → VaNiGTM, stale pin
│                 frontend/) + vani-main-vps  ├── docs/vani/   product specs
└── documents/, docs/                    └── CLAUDE.md, docs/VANI_AI_HANDOVER.md
```

What the split costs: a feature is two commits in two repos with no atomic
link; the console on Vercel called API routes that existed only on an
unmerged branch; handover and CLAUDE.md live in two places that point at each
other; the submodule pin is bumped by hand and is stale; and 381 files of
retired UI still shape VaNiGTM's root (scripts, tsconfig, dependencies,
build-push.sh, the ProKey compose).

## 1. Target

```
kamalcharan/VaNiGTM   (the home — see D1)
├── web/              marketing site: src/ public/ api/ index.html vercel.json …  → Vercel project "website", Root Directory web
├── vani-app/         Next.js console                                            → Vercel project "console", Root Directory vani-app
├── backend/          Express API + worker                                       → VPS, unchanged
├── deploy/vani-main-vps/                                                        unchanged
├── documents/        + documents/vani/ (from vikunawebsite docs/vani/)
├── docs/
├── .github/workflows/ci.yml   backend tests + vani-app build + web build, on every PR
└── CLAUDE.md · ARCH.md · AGENTS.md · DEPLOY.md · HANDOVER.md   one of each
    web/CLAUDE.md and vani-app/CLAUDE.md stay as the per-app standards

frontend/          gone, with every reference to it
kamalcharan/vikunawebsite   archived (read-only) once both Vercel projects deploy from VaNiGTM
```

Each app keeps its own `package.json` and lockfile. No workspaces: the three
import nothing from each other (checked for vani-app: no `../` beyond its own
`src/`). Root scripts only orchestrate: `dev:api`, `dev:worker`, `dev:ui`,
`dev:web`, `install:all`.

## 2. Decisions

| # | Decision | Default |
|---|---|---|
| D1 | Which repo is the home | **VaNiGTM.** The VPS checkout (`/opt/vikuna/src/vanigtm`), `deploy-vani.sh` and every backend path stay exactly as they are; only Vercel has to be re-pointed, and it has to be re-pointed either way |
| D2 | `deploy/` ProKey compose (backend + frontend + nginx, `vikuna/prokey-*` images) — still used by any customer instance? | If none: delete with `frontend/`. If one: move to `deploy/prokey/` frozen, noted as serving the retired UI |
| D3 | Keep history of both repos | **Yes.** Both histories are merged in, website files renamed into `web/`; `git log --follow` works on every moved file |
| D4 | Rename `VaNiGTM` → `vani` (or similar) now that it holds the website too | Not in this track. GitHub redirects old names, but the VPS path and docs name it; a separate one-line change later, or never |
| D5 | Freeze window | One announced day with no pushes to vikunawebsite while the merge lands |
| D6 | Anything in `frontend/` worth porting | **None required** — it was never deployed, so deleting it takes nothing offline. The pre-consolidation tag keeps it readable; items worth porting later (attention queue, pulse widget, storyteller deck share page, the public assessment flow) are listed in §4 as future console stories, not blockers |

## 3. Phases

### H0 — Before touching anything (½ hour)

- `main` of both repos is what we move: merge the open working branches first.
- Tag both repos `pre-consolidation-2026-10-xx` and push the tags. The
  retired `frontend/` and the pre-move website stay reachable there forever.

### H1 — Bring the website repo in, with history (½ day)

In a fresh clone of vikunawebsite (never the working copy):

```bash
git filter-repo \
  --to-subdirectory-filter web \
  --path-rename web/vani-app/:vani-app/ \
  --path-rename web/docs/vani/:documents/vani/ \
  --path web/vanigtm --path web/.gitmodules --invert-paths
```

→ every website file under `web/`, the console at `vani-app/`, product docs at
`documents/vani/`, the submodule gone — all with history. (Verify the result
with `git log --stat -3` and `ls` before merging; filter-repo applies the
options in order.)

In VaNiGTM, on a branch:

```bash
git remote add website <that filtered clone>
git fetch website
git merge --allow-unrelated-histories website/main
```

No conflicts are possible except at the root (`README.md`, `.gitignore`):
the website's copies are under `web/` after the filter. Check: `ls` shows
`backend/ vani-app/ web/ documents/ …`.

Same PR:
- Root `package.json`: `dev:web`, `build:web`, `dev:ui`, `build:ui`, `dev:api`,
  `dev:worker`, `install:all`.
- `.github/workflows/ci.yml` (neither repo has one): backend `npm test` +
  `tsc`, `vani-app` `next build`, `web` `npm run build`, each only when its
  folder changed.
- One `HANDOVER.md`; `web/docs/VANI_AI_HANDOVER.md` and the website's VaNi
  sections of its CLAUDE.md become one-line pointers or are removed.

### H2 — Re-point Vercel (Charan, ~30 min; nothing on the VPS changes)

Both existing projects, **re-linked** (keeps domains and env vars):

| Project | Repo | Root Directory | Ignored Build Step |
|---|---|---|---|
| website (www.vikuna.io) | VaNiGTM | `web` | `git diff --quiet HEAD^ HEAD -- web/` |
| console (vani.vikuna.io) | VaNiGTM | `vani-app` | `git diff --quiet HEAD^ HEAD -- vani-app/` |

`web/vercel.json` and `web/api/*` (the advisor/health functions) are read
relative to the Root Directory, so they keep working unchanged. Verify: a
`web/` commit deploys the site only; a `vani-app/` commit deploys the console
only; a `backend/` commit deploys neither; `/login → /dashboard` works
against `api.vikuna.io`; `www.vikuna.io/vani` still redirects.

Until the re-link, Vercel keeps deploying from vikunawebsite, so nothing can
go down during H1.

### H3 — Remove `frontend/` and every reference (½ day)

Delete `frontend/` (381 files). In the same PR:

| Where | Change |
|---|---|
| root `package.json` | drop `dev`, `dev:frontend`, `build:frontend`, `test:frontend` and the root `next`/`react`/`react-dom` dependencies that exist only for it |
| root `tsconfig.json` | drop `frontend` from `include` |
| root `Dockerfile`, `build-push.sh` | remove the frontend half, or the files, per D2 |
| `deploy/docker-compose.yml`, `nginx.conf`, `update.sh`, `configure.sh`, `migrate.sh` | per D2 |
| `CLAUDE.md` | delete "Frontend conventions — RETIRED APP" and every "frontend/ is retired / in the OTHER repo" note; the UI is `vani-app/` here. The two API-contract facts in that section (dates `DD-MMM-YYYY`, token names) move to ARCH.md |
| docs, HANDOVER, design notes | `frontend/…` paths become "retired — see tag pre-consolidation-…" |

Done when `grep -rn "frontend/" --exclude-dir=node_modules .` finds only the
tag reference.

### H4 — Retire vikunawebsite (after H2 is verified)

Archive the repo on GitHub (read-only, history kept). No slimming needed —
nothing deploys from it any more.

### H5 — Charan's laptop

One checkout of VaNiGTM replaces `OpenClaw\VaNiGTM` and
`website\vikunawebsite-git`. Record the path in HANDOVER.

## 4. `frontend/` — what it had that vani-app does not (future stories, not blockers)

Nothing here was ever deployed; deleting it loses nothing that runs. Kept as
a list so the ideas are not lost with the folder; each is readable at the tag.

| In `frontend/` | Where it would go |
|---|---|
| `components/today/AttentionQueue.tsx` (attention-skill: snooze, dismiss, reopen, log touch) | console `gtm-today` — the skill is live on the API |
| `PulseWidget` + `/pulses` (pulse-skill) | a dashboard widget |
| `/today/storyteller` + `(public)/deck/[token]` | GTM story library |
| `(vani)/a/[slug]`, `(vani)/r/[token]` — public assessment + report | console `(public)` when Track E builds the funnel; API routes `/assessment`, `/r/:token` stay live |
| Everything else (import, pool, audience, journeys, brain, war-room, design gallery, dev pages, VDF library) | already rebuilt in vani-app, or not wanted — drop |

## 5. Order and duration

```
H0  after today's branches are merged     tags                              ½ hour
H1  freeze day                            merge website in, CI, one handover ½ day
H2  same day (Charan)                     re-link both Vercel projects       ½ hour
H3  next day                              delete frontend/, clean refs       ½ day
H4  after H2 is verified for a day        archive vikunawebsite              —
H5  at the laptop                         one checkout                       —
```

Backend-only work (Track C, D2) does not wait for any of this — H never moves
`backend/`. Console and website work waits for H1 so nothing is built in the
old place.

## 6. Done when

- `git clone VaNiGTM && npm run install:all` then `dev:api`, `dev:worker`,
  `dev:ui`, `dev:web` bring up everything from one checkout.
- A change to a skill and its screen is ONE PR, and CI builds both.
- www.vikuna.io and vani.vikuna.io both deploy from VaNiGTM `main`, each only
  when its folder changes.
- `frontend/` is gone and nothing refers to it.
- vikunawebsite is archived; there is one CLAUDE.md, one HANDOVER.md.
