# VaNi Session Starter Guide

## How to start new sessions

### Claude.ai (guidance / architecture / planning)

Start a new chat with this context:

```
I'm building the VaNi Product Framework and products on top of it.

Current repos (all on github.com/kamalcharan):
- VaNiBase — shared framework (Express API, Next.js shell, 19 VDF components, scalability layer)
- KI-Prime — financial planning agent for MFDs (submodule: VaNiBase)
- kaala-dristi — time-cycle market risk analytics (submodule: VaNiBase, not yet integrated)

Current status:
- VaNiBase: Phase 0+1+2 complete. Scalability layer done. Demo skill working.
- KI-Prime: 5 of 8 skills built (portfolio, client, market, planning, import). Shell renders 9 recipe pages. Submodule wired. Currently debugging: skill execution endpoint returns "Tenant or user not found" — likely RLS or context builder issue.
- KaalaDristi: Phase 0 specs done. Pipeline and integration not started.

Architecture: Agent-Shell pattern. LFM2 self-hosted → Skills (deterministic) → Recipes (JSON) → Shell (VDF components). Multi-tenant with RLS. Table prefixes: VN_ (framework), KI_ (KI-Prime), KD_ (KaalaDristi).

I'm on Windows with Git Bash, Docker Desktop, VS Code. Claude Code for coding tasks.

[Then ask your question or describe what you want to work on]
```

### Claude Code — VaNiBase session

Open terminal in VaNiBase repo and run `claude`. First message:

```
Read CLAUDE.md in this repo root.

You are working on the VaNi Product Framework — the shared foundation consumed by product repos via git submodule.

CRITICAL RULES:
- Changes here affect ALL products (KI-Prime, KaalaDristi, ContractNest)
- Every change must be backward compatible
- All framework tables use VN_ prefix
- Push to main only after testing
- Test with demo-skill: npm run dev with VANI_MOCK=true

Current state: Phase 1+2 complete, scalability layer (S-01 to S-07) done.
Server, auth, context builder, skill executor, VaNi engine, memory, queue, 19 VDF components, recipe renderer, 6 themes.

After making changes:
1. Test locally (npm run dev)
2. Commit to current branch
3. Tell me the branch name so I can merge to main and push

[Then describe the task]
```

### Claude Code — KI-Prime session

Open terminal in KI-Prime repo and run `claude`. First message:

```
Read CLAUDE.md in this repo root.

You are working on KI-Prime — a financial planning agent for mutual fund distributors, built on the VaNi Product Framework.

CRITICAL RULES:
- vani-base/ is a READ-ONLY git submodule. NEVER modify files inside vani-base/
- Product code goes in: skills/, recipes/, migrations/, startup.ts, vani.config.ts
- All tables use KI_ prefix
- Every skill function: (params, ctx: SkillContext), returns { ...data, recipe: 'name' }
- Every SQL query: WHERE tenant_id = $tenant_id
- If you need a framework change, STOP and tell me

Current state:
- 5 skills built: portfolio, client, market, planning, import (21 handlers)
- 3 skills pending: alert (Wave 5), report (Wave 5), comms (Wave 6)
- 9 recipes defined, shell renders all pages
- Seed data loaded (5 clients, 8 schemes, 17 holdings, 8 goals)
- Debugging: direct skill endpoint (/api/v1/skills/) returns "Tenant or user not found"

After making changes:
1. Only commit product files (never vani-base/)
2. Tell me the branch name so I can merge to main

[Then describe the task]
```

## Merge workflow (after Claude Code finishes)

Every time Claude Code finishes work, it's on a branch. Run these in the repo:

```powershell
# Check which branch Claude Code used
git branch -a

# Fetch latest
git fetch origin

# Merge the Claude Code branch to main
git checkout main
git merge origin/claude/<branch-name>

# Push to GitHub
git push origin main
```

If VaNiBase was updated, also update the submodule in KI-Prime:
```powershell
cd "D:\projects\core projects\VaNiBase\phase0\ki-prime-overlay\vani-base"
git pull origin main
cd ..
git add vani-base
git commit -m "Update VaNiBase: <description>"
git push origin main
```
