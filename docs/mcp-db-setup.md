# Postgres MCP Connector — vani_gtm_db (read-only)

Adapts the proven KaalaDristi v2 architecture (MCP server on the VPS behind
nginx TLS + basic-auth, SSE transport) to `vani_gtm_db`. Only the DB, role,
container, and hostname differ.

```
Claude Code container ──HTTPS (proxy-allowlisted)──▶ vikuna-nginx (mcp-gtm.dristiq.com, basic-auth, TLS)
                                                        └─▶ gtm-mcp-db (postgres-mcp, --access-mode=restricted, SSE :8001)
                                                              └─▶ vikuna-postgres :5432 (role gtm_readonly, local only)
```

Read-only enforced at three layers: SELECT-only role with
`default_transaction_read_only = on` → postgres-mcp restricted mode → no
writable credential ever leaves the VPS.

## Step 1 — DB role (psql as superuser on the VPS)

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gtm_readonly') THEN
    CREATE ROLE gtm_readonly LOGIN PASSWORD 'CHANGE_ME_TEMP';
  END IF;
END $$;

ALTER ROLE gtm_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE gtm_readonly SET default_transaction_read_only = on;
ALTER ROLE gtm_readonly SET statement_timeout = '30s';

GRANT CONNECT ON DATABASE vani_gtm_db TO gtm_readonly;
\c vani_gtm_db
GRANT USAGE ON SCHEMA public TO gtm_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gtm_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO gtm_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO gtm_readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM gtm_readonly;

-- RLS caveat: tables with RLS enabled return 0 rows for a role without
-- BYPASSRLS unless app.current_tenant_id is set. For read-only inspection
-- across tenants, either grant bypass on this role:
--   ALTER ROLE gtm_readonly BYPASSRLS;   -- acceptable: SELECT-only role
-- or expect per-tenant queries to need:
--   SELECT set_tenant_context('<tenant-uuid>');
-- Recommendation: BYPASSRLS on gtm_readonly — it can only ever read.

-- Verify (expect t / f)
SELECT has_table_privilege('gtm_readonly','gt_contacts','SELECT') AS can_read,
       has_table_privilege('gtm_readonly','gt_contacts','INSERT') AS can_write;
```

## Step 2 — DNS + container + nginx

1. **DNS**: A record `mcp-gtm` → `187.127.136.65`.

2. **MCP container** (same docker network as `vikuna-postgres`; port 8001 to
   avoid clashing with the KaalaDristi one on 8000):

```bash
NET=$(docker inspect vikuna-postgres --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run -d --name gtm-mcp-db --restart unless-stopped --network "$NET" \
  -e DATABASE_URI="postgresql://gtm_readonly:<TEMP_PASSWORD>@vikuna-postgres:5432/vani_gtm_db" \
  crystaldba/postgres-mcp --access-mode=restricted --transport=sse --sse-host=0.0.0.0 --sse-port=8001
docker network connect "$NET" vikuna-nginx 2>/dev/null || true
```

3. **Certificate** (certbot standalone; ~10 s nginx downtime):

```bash
docker stop vikuna-nginx && certbot certonly --standalone -d mcp-gtm.dristiq.com && docker start vikuna-nginx
printf 'pre_hook = docker stop vikuna-nginx\npost_hook = docker start vikuna-nginx\n' \
  >> /etc/letsencrypt/renewal/mcp-gtm.dristiq.com.conf
```

4. **Basic-auth**: reuse `/root/mcp.htpasswd` from the KaalaDristi setup, or
   create a separate user the same way.

5. **nginx vhost** (same mounts/pattern as the mcp-db.dristiq.com one):

```nginx
server {
    listen 443 ssl;
    server_name mcp-gtm.dristiq.com;

    ssl_certificate     /etc/letsencrypt/live/mcp-gtm.dristiq.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp-gtm.dristiq.com/privkey.pem;

    auth_basic "gtm-mcp";
    auth_basic_user_file /etc/nginx/mcp.htpasswd;

    location / {
        proxy_pass http://gtm-mcp-db:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection '';
        proxy_buffering off;        # required for SSE
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
```

```bash
docker exec vikuna-nginx nginx -t && docker restart vikuna-nginx
```

Sanity check: `curl -u claude:<MCP_PASSWORD> https://mcp-gtm.dristiq.com/sse --max-time 5`
→ SSE stream (`event: endpoint`), not 401/404/502.

## Step 3 — Claude Code environment settings (claude.ai)

1. **Network policy**: allow `mcp-gtm.dristiq.com`.
2. **Environment variable**: `GTM_MCP_BASIC` = `base64("claude:<password>")`
   (`echo -n 'claude:<password>' | base64`).

## Step 4 — Connect

`.mcp.json` (committed, no secrets) registers the connector. Start a NEW
session after the env settings are in place; verify with:
`SELECT count(*) FROM gt_contacts;`

## Step 5 — Rotate

`ALTER ROLE gtm_readonly PASSWORD '<new>';` → update the container env →
restart `gtm-mcp-db`. Repo and Claude env unchanged.
