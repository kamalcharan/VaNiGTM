# CORS for api.vikuna.io — included by each proxied location.
# Named .inc, not .conf: nginx.conf does `include /etc/nginx/conf.d/*.conf;`,
# so a .conf here would load as a top-level block and fail.
#
# LIVE copy from the Main VPS (vikuna-nginx:/etc/nginx/conf.d/vani-cors.inc),
# 2026-09-30. $cors_origin comes from the map in api.vikuna.io.conf.
# Methods and headers must cover what vani-app sends: PATCH/PUT/DELETE, and
# Idempotency-Key on every write (vani-app/CLAUDE.md).

if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin      $cors_origin always;
    add_header Access-Control-Allow-Credentials 'true' always;
    add_header Access-Control-Allow-Methods     'GET, POST, PATCH, PUT, DELETE, OPTIONS' always;
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
