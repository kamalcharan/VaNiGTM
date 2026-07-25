# VaNi GTM Engine — UI Prototype

**Neural Ops Design System** | Dark cinematic mission-control aesthetic

## Screens (Tenant Onboarding Flow)

| # | File | Purpose |
|---|------|---------|
| 1 | `index.html` | Welcome & Tenant Setup — Initialize a new mission |
| 2 | `icp-config.html` | ICP Configuration — Define personas, signals, company size, geo |
| 3 | `channels.html` | Channel Setup — Connect email, WhatsApp, LinkedIn + orchestration rules |
| 4 | `aeo-content.html` | AEO & Content — AI visibility tracker, target queries, content clusters |
| 5 | `sequences.html` | Sequence Builder — Visual flow builder with template editor |
| 6 | `contacts.html` | Contacts & Launch — Import, pipeline view, mission launch animation |
| 7 | `war-room.html` | Agent War Room — Live operational dashboard (post-launch) |
| 8 | `agent-runs.html` | Agent Decision Logs — Observability, expandable run details |
| 9 | `analytics.html` | Performance Analytics — Metrics, funnels, recommendations |

## How to Use

1. Open `index.html` in a browser
2. Walk through the onboarding flow (1→6)
3. Launch mission → redirects to War Room
4. Use sidebar nav for post-launch screens (7→9)

## Design System

- **Fonts**: Outfit (display), Instrument Sans (body), JetBrains Mono (mono)
- **Colors**: Electric Cyan (`#00e5ff`), Signal Green (`#00e676`), Warn Amber (`#ffd740`)
- **Aesthetic**: Dark void background, subtle grid overlay, ambient glow effects
- **Shared**: `shared/styles.css` contains the full design system

## Architecture

Built as static HTML with inline CSS overrides per page. Shared design system in `shared/styles.css`. All mock data is inline. No build tools required — open in any browser.

## Next Steps

- [ ] Migrate to React component architecture
- [ ] Connect to Supabase backend
- [ ] Replace mock data with live API calls
- [ ] Add real-time WebSocket feeds for War Room