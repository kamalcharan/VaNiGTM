# SearXNG setup — web search for the research-skill agent

The competitor-research agent (`backend/src/skills/research-skill/`)
searches the live web through a **self-hosted SearXNG** instance — no API
key, no per-query cost, runs on the same VPS as browserless. The backend
calls it directly (`agent-core/search.client.ts`); n8n is not involved.

If `SEARXNG_URL` is unset or the instance is down, competitor research
**fails loudly** (`SEARCH_NOT_CONFIGURED` / `SEARCH_FAILED`) — by design
(CLAUDE.md rule 12, no silent fallbacks).

## 1. Deploy on the VPS

Add to a compose file (or run standalone). Port 3011 on the host, matching
the browserless-on-3010 convention:

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    restart: unless-stopped
    ports:
      - "3011:8080"
    volumes:
      - ./searxng:/etc/searxng
    environment:
      - SEARXNG_BASE_URL=http://<VPS-IP>:3011/
```

```bash
docker compose up -d searxng
```

## 2. Enable the JSON API — REQUIRED

SearXNG ships with the JSON format **disabled**; every `format=json`
request returns **403** until it's enabled. After the first start, edit the
generated `./searxng/settings.yml`:

```yaml
search:
  formats:
    - html
    - json          # ← add this line
```

Then `docker restart searxng`.

While you're in `settings.yml`: the default `limiter: true` rate-limits
clients aggressively. For a private, firewalled instance it's fine to set
`limiter: false` (in the `server:` block) so agent bursts (≤4 queries per
run) never get throttled.

## 3. Verify

```bash
curl -s "http://<VPS-IP>:3011/search?q=test&format=json" | head -c 300
```

Expect JSON starting with `{"query": "test", "number_of_results": ...`.
A 403 here means step 2 wasn't applied (or the container wasn't restarted).

## 4. Point the backend at it

`backend/.env`:

```bash
SEARXNG_URL=http://<VPS-IP>:3011
```

Hard-restart the backend AND the worker (tsx watch reloads code, not env).

## 5. Security note

SearXNG has no built-in auth. Exposing 3011 publicly invites abuse (open
search proxies get scraped hard). Pick one:

- **Firewall allowlist** (simplest, matches the browserless setup):
  `ufw allow from <your-dev-ip> to any port 3011` and keep the port closed
  otherwise. The worker on the VPS reaches it via the docker network/host.
- **Traefik + basic auth** hostname route, then
  `SEARXNG_URL=https://user:pass@search.example.com` (the client passes
  the URL to `fetch`, which handles basic-auth URLs).
- **Bind to localhost** (`127.0.0.1:3011:8080`) if backend + worker run on
  the same VPS.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `SEARCH_NOT_CONFIGURED` | `SEARXNG_URL` unset in the worker's env — set it and hard-restart the worker |
| `SEARCH_FAILED … 403` | JSON format not enabled (step 2) |
| `SEARCH_FAILED: SearXNG unreachable` | wrong IP/port, firewall, or container down (`docker ps`, `docker logs searxng`) |
| `SEARCH_EMPTY` | instance up but all engines failing — check `docker logs searxng`; some engines block datacenter IPs, enable more engines in settings.yml |
