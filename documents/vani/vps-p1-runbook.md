# VPS runbook — unblocking P1 (auth for vani.vikuna.io)

**Goal:** `vani.vikuna.io` (Vercel) can call `api.vikuna.io` (VPS) and hold a
session. Three things are missing: DNS, an SSL certificate, and a CORS entry.

This does **not** repeat `VaNiGTM/deploy/vani-main-vps/RUNBOOK.md` — that covers
building and starting the backend. This covers only what P1 needs on top, and it
starts by resolving the six unknowns that runbook flagged as guesses.

> **Why HTTPS is non-negotiable here.** The refresh cookie is set with
> `secure: NODE_ENV === 'production'`. Over plain HTTP the browser silently
> refuses to store it — login appears to work and the session vanishes on
> reload. Do not test auth on HTTP and conclude the code is broken.

---

## Step 0 · Discovery — RESOLVED 2026-08-16

Ran against the Main VPS (`srv1528480`, `187.127.136.65`). The six unknowns
VaNiGTM's runbook flagged as guesses are now facts:

| Unknown | Answer |
|---|---|
| Shared Docker network | **`vikuna-net`** — put this in `deploy/vani-main-vps/.env` as `NETWORK_NAME=vikuna-net` |
| nginx conf.d drop-in path | **`/opt/vikuna/docker/docker/config/nginx/conf.d/`** on the host, mounted **read-only** at `/etc/nginx/conf.d` |
| nginx main config | `/opt/vikuna/docker/docker/config/nginx/nginx.conf` (host), read-only |
| Certificates | `/etc/letsencrypt` is **already bind-mounted read-only** into `vikuna-nginx`, and certs already exist for **`api.vikuna.io`** *and* **`vani.vikuna.io`** |
| certbot | present at `/usr/bin/certbot` |
| Backend | `vani-backend` (`vikuna/vani-backend:latest`) **up 2 weeks, healthy**, listening on 3001, no published port — reached through nginx over `vikuna-net` |

DNS today — **both** already resolve to the VPS:

```
api.vikuna.io   → 187.127.136.65
vani.vikuna.io  → 187.127.136.65
```

Other containers on the box: `vikuna-postgres` (17-alpine), `vikuna-postgrest`,
`vikuna-llm` (llama.cpp), and the KaalaDristi stack (`kd-pipeline-api2`,
`kd-frontend`, `kd-mcp-db`).

### What this changes

- **Step 2 (certificate issuance) is essentially done.** No webroot dance, no
  ACME challenge location, no new mount. The cert exists and nginx can already
  read it.
- **`vani.vikuna.io` currently points at the VPS, not Vercel.** That is the one
  real obstacle: the console needs that name served by Vercel. Whatever is
  answering on it today has to be identified before the record moves.
- **The `snippets/` path in `vani-cors.conf` does not exist.** Only `conf.d` is
  mounted, so `include /etc/nginx/snippets/vani-cors.conf;` would fail to load.
  Either inline the CORS block into each location, or ship the snippet as
  `conf.d/vani-cors.inc` (a non-`.conf` extension so nginx's `conf.d/*.conf`
  glob does not auto-load it as a server block) and include that path instead.
- **Config is mounted read-only.** Edit on the host under
  `/opt/vikuna/docker/docker/config/nginx/conf.d/`, never inside the container.

### Ports — checked, and my earlier alarm was wrong

`ufw status` shows the box is not as exposed as `docker ps` implied:

```
22, 80, 443/tcp   ALLOW  Anywhere
5432/tcp          ALLOW  only 3 specific IPs + one IPv6 /64
3000, 8080        not allowed at all
```

Postgres is restricted to named addresses, and PostgREST and the LLM server have
no ufw rule, so the default policy drops them. The `0.0.0.0:` bindings in
`docker ps` are the Docker publish addresses, not evidence of public reach.

**One caveat worth a single check.** Docker writes its own iptables rules and
commonly bypasses ufw's INPUT chain for published ports — a known behaviour, not
a misconfiguration on this box. If you want certainty, test from *outside* the
VPS rather than from it:

```bash
nc -zv 187.127.136.65 3000   # PostgREST — expect refused/timeout
nc -zv 187.127.136.65 8080   # llama.cpp — expect refused/timeout
```

If either connects, the fix is to bind them to `127.0.0.1:3000:3000` in compose
rather than to add ufw rules, since ufw is the layer being bypassed.

---

## Step 0c · Second discovery pass — RESOLVED

```
conf.d/            .gitkeep, api.vikuna.io.conf (Aug 1, 2064 B),
                   dristiq.conf, dristiq.conf.bak-20260710,
                   mcp-db.conf, mcp.htpasswd
include pattern    include /etc/nginx/conf.d/*.conf;
grep vani.vikuna.io in conf.d   → no match
curl -sI https://api.vikuna.io/health → HTTP/1.1 200 OK (nginx/1.29.7)
```

Three conclusions, all of which shrink the remaining work:

1. **`api.vikuna.io` is already live over TLS.** The config is deployed, the cert
   is in use, and `/health` answers 200. Steps 1 and 2 of this runbook are done
   for the API. Note the deployed file is 2 064 bytes — smaller than the version
   in `VaNiGTM/deploy/vani-main-vps/`, so **the two are not identical** and the
   repo copy must not be assumed authoritative.
2. **Nothing is served on `vani.vikuna.io`.** No server block references it, so
   requests fall through to whichever block nginx treats as default. The cert
   exists and DNS points here, but there is no site. **Repointing that record to
   Vercel therefore breaks nothing** — the obstacle flagged earlier does not
   exist.
3. **The include is `conf.d/*.conf`**, so a CORS snippet shipped as
   `conf.d/vani-cors.inc` will not be auto-loaded as a server block and can be
   included explicitly. (`dristiq.conf.bak-20260710` is already relying on this —
   it does not end in `.conf`, so nginx ignores it.)

### VPS work — COMPLETE 2026-08-16

`conf.d/vani-cors.inc` created and `conf.d/api.vikuna.io.conf` rewritten with the
origin map and three includes. `nginx -t` clean, reloaded. Verified:

| Test | Result |
|---|---|
| `Origin: https://vani.vikuna.io` on `/api/v1/auth/login` | echoes `https://vani.vikuna.io` |
| `Origin: https://www.vikuna.io` on `/api/v1/assessment/` | echoes `https://www.vikuna.io` |
| `Origin: https://evil.example` | **no header at all** |
| `Access-Control-Allow-Origin` count on a proxied POST | **1** — `proxy_hide_header` works |
| `/api/v1/skills/contact-skill/x` | **404** — allowlist holds |

**This also fixed a live breakage.** Before the change, every response carried
`Access-Control-Allow-Origin: http://localhost:3000` — `CORS_ORIGIN` was never
set on the container, so `server.ts` was falling back to its hardcoded
development default. Browser calls to this API from `www.vikuna.io` were being
rejected. They now work.

`CORS_ORIGIN` in the backend env is now inert: nginx strips whatever Express
emits and substitutes the map's value. Leave it, or remove it — it no longer
affects behaviour.

### What is actually left

| # | Task | Where | Status |
|---|---|---|---|
| 1 | CORS map + includes | `conf.d/` on the VPS | **done** |
| 2 | Point `vani.vikuna.io` at Vercel | Vercel DNS | **done** |
| 3 | Vercel project, Root Directory `vani-app` | Vercel | **done** — live at vani.vikuna.io/dashboard |
| 4 | `NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io` | Vercel env | confirm |
| 5 | Ignored Build Steps on both projects | Vercel | outstanding |
| 6 | Delete the now-stale `vani.vikuna.io` cert on the VPS | VPS | outstanding |
| 7 | Preview slug is `vani-iota`, not `vani-app` — CORS map does not match it | VPS | optional |

### Notes on the remaining items

**DNS was managed by Vercel, not GoDaddy.** GoDaddy holds registration only and
reports "DNS Provider: Vercel". The blocker was a stale `A` record for `vani`
pointing at the VPS; Vercel will not attach a domain that already resolves
elsewhere. Deleting that record in Vercel's DNS panel resolved it. The `api`
record must stay pointing at `187.127.136.65`.

**The VPS cert for `vani.vikuna.io` is now orphaned.** Renewal will fail, because
the HTTP-01 challenge now lands on Vercel. Nothing in nginx serves that name, so
removing it breaks nothing:

```bash
certbot delete --cert-name vani.vikuna.io    # leave api.vikuna.io alone
```

**Preview deploys will fail CORS.** Vercel named the project `vani-iota`, so
`vani-iota*.vercel.app` does not match the `vani-app` pattern in the map.
Production is unaffected — `vani.vikuna.io` has its own entry. Fix by renaming
the Vercel project to `vani-app` (no VPS change), or by editing that one line in
the map.

**Ignored Build Steps**, or every commit rebuilds both projects:

```
vani project       git diff --quiet HEAD^ HEAD -- vani-app
marketing project  git diff --quiet HEAD^ HEAD -- . ':(exclude)vani-app'
```

Nothing further is needed on the VPS. Certificate, backend, TLS, allowlist and
CORS are all in place.

---

## Step 0b · Three things still to confirm

```bash
# a) What is already deployed, and what serves vani.vikuna.io today?
ls -la /opt/vikuna/docker/docker/config/nginx/conf.d/
grep -rl "vani.vikuna.io" /opt/vikuna/docker/docker/config/nginx/conf.d/

# b) How does nginx include conf.d? (decides the .inc trick above)
docker exec vikuna-nginx nginx -T 2>/dev/null | grep -nE "include .*conf" | head

# c) Is the API already answering over TLS?
curl -sI https://api.vikuna.io/health | head -3
```

---

## Step 0 (original) · Discovery — for reference



Nothing is changed by any of this. It answers the runbook's open guesses.

```bash
# a) What is actually running
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

# b) The shared network name (RUNBOOK guess #1 — needed by docker-compose.vani.yml)
docker inspect vikuna-nginx --format '{{json .NetworkSettings.Networks}}'

# c) Where nginx reads config from (RUNBOOK guess #3)
docker inspect vikuna-nginx --format '{{json .Mounts}}'
docker exec vikuna-nginx nginx -T 2>/dev/null | grep -E '^\s*(include|server_name|listen)' | head -20

# d) Is there already a cert story on this box? (RUNBOOK guess #4)
docker exec vikuna-nginx ls /etc/letsencrypt/live 2>/dev/null || echo "no letsencrypt in container"
ls /etc/letsencrypt/live 2>/dev/null || echo "no letsencrypt on host"
which certbot || echo "certbot not on host"

# e) Where DNS currently points
dig +short api.vikuna.io
dig +short vani.vikuna.io
curl -s -o /dev/null -w 'api.vikuna.io → %{http_code}\n' http://api.vikuna.io/health

# f) Is the VaNi backend container up at all?
docker ps --filter name=vani-backend --format '{{.Names}} {{.Status}}'
```

**What each answer decides**

| Output | Decides |
|---|---|
| (b) network name | The `NETWORK_NAME=` value in `deploy/vani-main-vps/.env` |
| (c) mounts + includes | Where `api.vikuna.io.conf` and `vani-cors.conf` get dropped |
| (d) certbot presence | Whether Step 2 uses the existing process or a fresh webroot issue |
| (e) DNS | Whether Step 1 is needed at all |
| (f) container | Whether the backend runbook has actually been run yet |

---

## Step 1 · DNS

Two records, at your DNS provider:

| Host | Type | Value |
|---|---|---|
| `api` | A | *the Main VPS IPv4* |
| `vani` | CNAME | `cname.vercel-dns.com` |

`api` → the VPS because that is where Express runs. `vani` → Vercel because that
is where the UI is served. They must both be under `vikuna.io`: that shared
registrable domain is what makes them **same-site**, which is the only reason the
`SameSite=Strict` refresh cookie is sent at all. Putting the API on a different
domain would break auth in a way no amount of frontend work can fix.

Verify (propagation can take a few minutes):

```bash
dig +short api.vikuna.io    # → the VPS IP
dig +short vani.vikuna.io   # → a vercel-dns hostname
```

---

## Step 2 · Certificate for api.vikuna.io

Only do this once `dig +short api.vikuna.io` returns the VPS IP — issuance
validates over HTTP against that record.

Because nginx runs in a container, the tidiest route is **webroot**: nginx serves
the ACME challenge from a directory the host also sees, so nothing has to stop.

**2a.** Add a challenge location to the port-80 server block in
`api.vikuna.io.conf`, above the other locations:

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type "text/plain";
}
```

**2b.** Bind-mount `/var/www/certbot` into the nginx container (add to its
compose service), then reload:

```bash
docker exec vikuna-nginx nginx -t && docker exec vikuna-nginx nginx -s reload
```

**2c.** Issue:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d api.vikuna.io --agree-tos -m connect@vikuna.io --no-eff-email
```

**2d.** Mount `/etc/letsencrypt` read-only into the nginx container, then
uncomment the 443 server block at the bottom of `api.vikuna.io.conf` — it is
already written, with the same three location blocks — and the HTTP→HTTPS
redirect below it.

> If Step 0(d) shows this VPS already has its own cert process for other vhosts,
> use that instead. Do not run two issuance mechanisms on one box.

Verify:

```bash
curl -sI https://api.vikuna.io/health | head -3     # expect HTTP/2 200
curl -sI http://api.vikuna.io/health  | head -3     # expect 301 → https
```

---

## Step 3 · Let vani.vikuna.io through CORS

In `api.vikuna.io.conf`, the `map $http_origin $cors_origin` block currently
allows only `vikuna.io`, `www.vikuna.io` and `vikunawebsite-*.vercel.app`. Add
the console and its Vercel previews:

```nginx
map $http_origin $cors_origin {
    default                                                    "";
    "~^https://(www\.)?vikuna\.io$"                            "$http_origin";
    "~^https://vikunawebsite(-[a-zA-Z0-9-]+)?\.vercel\.app$"   "$http_origin";
    "~^https://vani\.vikuna\.io$"                              "$http_origin";   # ← add
    "~^https://vani-app(-[a-zA-Z0-9-]+)?\.vercel\.app$"        "$http_origin";   # ← add
}
```

The empty default is correct and deliberate: an unrecognised origin gets **no**
CORS header rather than an echoed one. Keep it.

Confirm the second pattern against a real preview URL once the Vercel project
exists — the project slug may not be `vani-app`.

```bash
docker exec vikuna-nginx nginx -t && docker exec vikuna-nginx nginx -s reload
```

---

## Step 4 · Prove it end to end

These four are the actual gate for P1. Run them from anywhere.

```bash
# 1. Health, over TLS
curl -sI https://api.vikuna.io/health | head -1
#    → HTTP/2 200

# 2. CORS echoes the console origin
curl -s -o /dev/null -D- -X OPTIONS https://api.vikuna.io/api/v1/auth/login \
  -H 'Origin: https://vani.vikuna.io' \
  -H 'Access-Control-Request-Method: POST' | grep -i 'access-control-allow'
#    → access-control-allow-origin: https://vani.vikuna.io
#    → access-control-allow-credentials: true

# 3. An unknown origin gets NO header (this must return nothing)
curl -s -o /dev/null -D- -X OPTIONS https://api.vikuna.io/api/v1/auth/login \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: POST' | grep -i 'access-control-allow-origin'
#    → (no output)

# 4. A non-allowlisted skill path is still refused at nginx
curl -s -o /dev/null -w '%{http_code}\n' https://api.vikuna.io/api/v1/skills/contact-skill/x
#    → 404
```

Test 3 failing open, or test 4 returning anything other than 404, means the
allowlist is not doing its job — stop and fix before wiring the UI.

---

## Then, and only then

Set `NEXT_PUBLIC_API_ORIGIN=https://api.vikuna.io` in the Vercel project and P1
can begin. Nothing in P1 needs anything else from the VPS: the four auth
endpoints are already inside the nginx allowlist as written.

**Still not decided:** signup. Everything above serves login/logout either way.
