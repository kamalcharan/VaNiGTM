# n8n workflows for VaNi GTM

Approved use of the user's n8n infra (CLAUDE.md architecture note):
agent-adjacent jobs only, authenticated, environment-routed. Business
logic stays in this repo — n8n nodes do mechanical work (render, batch).

## vani-render-page — headless page render

Called by the ingestion agent ONLY when a site's static HTML yields
< 200 chars of readable text (JS-rendered SPA). Never silent: the
escalation appears as `render_page` / `render_complete` steps in the
run, and any failure fails the ingestion run loudly (rule 12).

### Deploy (once, on the n8n instance)

1. **Install the community node** — Settings → Community Nodes →
   Install → `n8n-nodes-puppeteer`. (Ships Chromium; on a Docker
   install use an image with Chrome deps, e.g. add
   `--cap-add=SYS_ADMIN` or the puppeteer docker docs' deps.)
2. **Set the shared secret** on the instance environment:
   `VANI_RENDER_SECRET=<long random string>`
   (n8n reads it via `$env` in the validate node; requires
   `N8N_BLOCK_ENV_ACCESS_IN_NODE` to NOT be true.)
3. **Import** `vani-render-page.workflow.json` and **activate** it.
4. Smoke test:
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
