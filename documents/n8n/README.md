# n8n workflows for VaNi GTM

Approved use of the user's n8n infra (CLAUDE.md architecture note):
agent-adjacent jobs only, authenticated, environment-routed. Business
logic stays in this repo — n8n nodes do mechanical work (render, batch).

## vani-render-page — headless page render

Called by the ingestion agent ONLY when a site's static HTML yields
< 200 chars of readable text (JS-rendered SPA). Never silent: the
escalation appears as `render_page` / `render_complete` steps in the
run, and any failure fails the ingestion run loudly (rule 12).

### Two variants — pick ONE (same webhook path + contract)

| File | Rendering engine | Needs |
|---|---|---|
| `vani-render-page.browserless.workflow.json` | **RECOMMENDED** — browserless container, stock n8n nodes only | one docker container on the VPS |
| `vani-render-page.workflow.json` | `n8n-nodes-puppeteer` community node | community-node install (Chromium deps inside the n8n container — fragile on Docker installs) |

⚠️ **Import order matters:** n8n rejects a workflow referencing an
uninstalled node type ("Unrecognized node type:
n8n-nodes-puppeteer.puppeteer"). For the puppeteer variant you MUST
install the community node BEFORE importing. The browserless variant
has no such requirement — it imports on any stock n8n.

### Deploy — variant A: browserless (recommended)

1. **Run browserless** on the VPS:
   ```bash
   docker run -d --name browserless --restart unless-stopped \
     -p 3010:3000 -e "TOKEN=<random-token>" ghcr.io/browserless/chromium
   ```
2. **n8n instance env:**
   ```
   VANI_RENDER_SECRET=<long random string>
   BROWSERLESS_URL=http://<host-reachable-from-n8n>:3010
   BROWSERLESS_TOKEN=<same as TOKEN above>
   ```
   (n8n reads these via `$env`; requires `N8N_BLOCK_ENV_ACCESS_IN_NODE`
   to NOT be true. If n8n runs in Docker on the same host, use the
   docker network address, not localhost.)
3. **Import** `vani-render-page.browserless.workflow.json`, **activate**.

### Deploy — variant B: puppeteer community node

1. **Install the community node FIRST** — Settings → Community Nodes →
   Install → `n8n-nodes-puppeteer`. (Ships Chromium; on a Docker
   install the container needs Chrome deps — if the install or first
   run fails, use variant A instead.)
2. **Set** `VANI_RENDER_SECRET=<long random string>` on the instance
   environment.
3. **Import** `vani-render-page.workflow.json` and **activate** it.

### Smoke test (either variant)
   ```bash
   curl -X POST "$N8N_URL/webhook/vani-render-page" \
     -H 'Content-Type: application/json' \
     -H "x-vani-secret: $VANI_RENDER_SECRET" \
     -d '{"url":"https://vikuna.io/"}'
   # expect: {"success":true,"url":"…","chars":<n>,"html":"…"}
   ```
   (Use `/webhook-test/...` with the editor open for test mode.)

### Backend env (backend/.env)

```
N8N_RENDER_URL=https://<your-n8n-host>
N8N_RENDER_SECRET=<same value as VANI_RENDER_SECRET>
N8N_ENV=live            # 'live' → /webhook, anything else → /webhook-test
```

Unset = the escalation errors with RENDER_NOT_CONFIGURED (loud, per
rule 12) and the wizard offers the paste-copy path.

### Contract

Request: `POST {N8N_RENDER_URL}{/webhook|/webhook-test}/vani-render-page`
headers `x-vani-secret`, body `{"url": "https://…"}`.

Response 200: `{ "success": true, "url", "chars", "html" }`
Response 400: `{ "success": false, "errorCode": "INVALID_INPUT_OR_AUTH" | "RENDER_FAILED" | "RENDER_EMPTY", "message", "details?", "recoverable" }`

Note: the Format Render Result code node normalizes the Puppeteer
node's output across versions (html may arrive as `body`/`data`/`html`).
If your installed n8n-nodes-puppeteer version names the operation
differently (e.g. "Get Page Content" resource/operation split), adjust
the "Render Page (Puppeteer)" node parameters after import — the rest
of the workflow is version-independent.
