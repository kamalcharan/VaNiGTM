# ============================================================
# CORS for api.vikuna.io — included by each proxied location.
#
# Named .inc, not .conf, deliberately: nginx.conf does
# `include /etc/nginx/conf.d/*.conf;`, so a .conf here would be loaded as a
# top-level block and fail. (dristiq.conf.bak-20260710 already relies on the
# same rule.)
#
# WHY THIS EXISTS AT THE EDGE.
# The backend sets CORS itself — server.ts does
# `cors({ origin: process.env.CORS_ORIGIN, credentials: true })` — but `origin`
# there is a SINGLE string, so it can allow exactly one origin. The assessment
# funnel needs www.vikuna.io and the console needs vani.vikuna.io, which one
# string cannot express without a code change and an image rebuild.
#
# Doing it here also keeps CORS next to the path allowlist it belongs with.
# Express's own headers are stripped first — two Access-Control-Allow-Origin
# headers on one response is a hard browser error, not a merge.
# ============================================================

# Preflight is answered here and never reaches Express, so its single-origin
# config cannot contradict us. `return` inside `if` is one of the two
# documented-safe uses of `if` in a location.
if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin      $cors_origin always;
    add_header Access-Control-Allow-Credentials 'true' always;
    add_header Access-Control-Allow-Methods     'GET, POST, PATCH, PUT, DELETE, OPTIONS' always;
    # Idempotency-Key is load-bearing, not decoration: useSkillMutation sends it
    # on every write. A header the preflight does not allow is a header the
    # browser refuses to send the request with at all — so omitting it here does
    # not degrade idempotency, it blocks the write outright.
    add_header Access-Control-Allow-Headers     'Authorization, Content-Type, Idempotency-Key' always;
    add_header Access-Control-Max-Age           86400 always;
    add_header Vary                             'Origin' always;
    add_header Content-Length                   0;
    return 204;
}

proxy_hide_header Access-Control-Allow-Origin;
proxy_hide_header Access-Control-Allow-Credentials;

add_header Access-Control-Allow-Origin      $cors_origin always;
add_header Access-Control-Allow-Credentials 'true' always;
add_header Vary                             'Origin' always;
