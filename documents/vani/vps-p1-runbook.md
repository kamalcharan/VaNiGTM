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

## Step 0 · Discovery — run these and paste the output back

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
