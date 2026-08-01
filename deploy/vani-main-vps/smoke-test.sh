#!/usr/bin/env bash
# ============================================================
# VaNi AI — deployed-host smoke test
#
# Black-box HTTP test against the REAL deployed stack (nginx routing, CORS,
# the actual container) — distinct from verify-assessment-flow.ts (which
# tests AssessmentAgent directly against the DB, no HTTP/nginx involved).
# Run this from your laptop, not on the VPS, per Task A2's ask.
#
# Usage:
#   ./smoke-test.sh https://api.vikuna.io
#   ./smoke-test.sh http://<vps-ip>            # before DNS/cert exist
#
# Requires: curl, jq (brew install jq / apt install jq)
# ============================================================
set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "Usage: $0 <base-url>   e.g. $0 https://api.vikuna.io"
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq / apt install jq)"; exit 1
fi

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1${2:+ — $2}"; }

echo "Target: $BASE"
echo

# ── [1] GET the public definition ────────────────────────────────────────
echo "[1] GET /api/v1/assessment/ai-recovery"
DEF_RESP=$(curl -sS -w '\n%{http_code}' "$BASE/api/v1/assessment/ai-recovery")
DEF_CODE=$(echo "$DEF_RESP" | tail -1)
DEF_BODY=$(echo "$DEF_RESP" | sed '$d')
[ "$DEF_CODE" = "200" ] && ok "200 OK" || bad "expected 200, got $DEF_CODE"
Q_COUNT=$(echo "$DEF_BODY" | jq '.questions | length' 2>/dev/null)
[ "$Q_COUNT" = "12" ] && ok "12 questions returned" || bad "expected 12 questions, got $Q_COUNT"

# ── [2] Answer all 12 questions ──────────────────────────────────────────
echo
echo "[2] POST /api/v1/assessment/answer x12"
declare -A ANSWERS=( [Q1]=2 [Q2]=2 [Q3]=1 [Q4]=3 [Q5]=3 [Q6]=1 [Q7]=0 [Q8]=2 [Q9]=1 [Q10]=0 [Q11]=2 [Q12]=1 )
RESPONSE_ID=""
ANON_TOKEN=""
for Q in Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q9 Q10 Q11 Q12; do
  BODY=$(jq -n \
    --arg rid "$RESPONSE_ID" --arg tok "$ANON_TOKEN" \
    --arg slug "ai-recovery" --arg qid "$Q" --argjson idx "${ANSWERS[$Q]}" \
    '{service_slug: $slug, question_id: $qid, option_index: $idx} +
     (if $rid != "" then {response_id: $rid, anon_token: $tok} else {} end)')
  RESP=$(curl -sS -X POST "$BASE/api/v1/assessment/answer" -H 'Content-Type: application/json' -d "$BODY")
  RESPONSE_ID=$(echo "$RESP" | jq -r '.response_id // empty')
  ANON_TOKEN=$(echo "$RESP" | jq -r '.anon_token // empty')
  if [ -z "$RESPONSE_ID" ] || [ -z "$ANON_TOKEN" ]; then
    bad "answer $Q failed" "$RESP"; break
  fi
done
[ -n "$RESPONSE_ID" ] && [ -n "$ANON_TOKEN" ] && ok "response created (id=$RESPONSE_ID)" || bad "no response_id/anon_token after 12 answers"

# ── [3] Complete ──────────────────────────────────────────────────────────
echo
echo "[3] POST /api/v1/assessment/complete"
COMPLETE_RESP=$(curl -sS -X POST "$BASE/api/v1/assessment/complete" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg rid "$RESPONSE_ID" --arg tok "$ANON_TOKEN" '{response_id: $rid, anon_token: $tok}')")
HEALTH=$(echo "$COMPLETE_RESP" | jq -r '.health_score // empty')
BAND=$(echo "$COMPLETE_RESP" | jq -r '.band // empty')
[ -n "$HEALTH" ] && ok "scored: health=$HEALTH band=$BAND" || bad "no health_score in response" "$COMPLETE_RESP"

# ── [4] Capture ───────────────────────────────────────────────────────────
echo
echo "[4] POST /api/v1/assessment/capture"
CAPTURE_RESP=$(curl -sS -X POST "$BASE/api/v1/assessment/capture" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg rid "$RESPONSE_ID" --arg tok "$ANON_TOKEN" \
    '{response_id: $rid, anon_token: $tok, name: "Smoke Test", email: "smoke-test@vikuna.io", company: "Smoke Test Co", role_title: "QA"}')")
REPORT_TOKEN=$(echo "$CAPTURE_RESP" | jq -r '.report_token // empty')
LEAD_NO=$(echo "$CAPTURE_RESP" | jq -r '.lead_no // empty')
[ -n "$REPORT_TOKEN" ] && ok "lead captured ($LEAD_NO), report_token issued" || bad "no report_token in response" "$CAPTURE_RESP"

# ── [5] Report ────────────────────────────────────────────────────────────
echo
echo "[5] GET /api/v1/assessment/report/:token"
REPORT_RESP=$(curl -sS -w '\n%{http_code}' "$BASE/api/v1/assessment/report/$REPORT_TOKEN")
REPORT_CODE=$(echo "$REPORT_RESP" | tail -1)
REPORT_BODY=$(echo "$REPORT_RESP" | sed '$d')
[ "$REPORT_CODE" = "200" ] && ok "200 OK" || bad "expected 200, got $REPORT_CODE"
NARRATIVE=$(echo "$REPORT_BODY" | jq -r '.narrative // empty')
[ -n "$NARRATIVE" ] && ok "narrative present" || bad "no narrative in report"
echo "  Narrative: \"$NARRATIVE\""

# ── [6] CORS preflight ────────────────────────────────────────────────────
echo
echo "[6] CORS preflight (OPTIONS, Origin: https://www.vikuna.io)"
CORS_HEADERS=$(curl -sS -i -X OPTIONS "$BASE/api/v1/assessment/answer" \
  -H 'Origin: https://www.vikuna.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type')
echo "$CORS_HEADERS" | grep -qi '^HTTP.* 204' && ok "204 No Content" || bad "expected 204" "$(echo "$CORS_HEADERS" | head -1)"
echo "$CORS_HEADERS" | grep -qi '^Access-Control-Allow-Origin: https://www.vikuna.io' \
  && ok "Access-Control-Allow-Origin echoes the requesting origin" \
  || bad "Access-Control-Allow-Origin missing or wrong"
echo "$CORS_HEADERS" | grep -qi '^Access-Control-Allow-Credentials: true' \
  && ok "Access-Control-Allow-Credentials: true" \
  || bad "Access-Control-Allow-Credentials missing"

echo
echo "[6b] CORS preflight from an UNAPPROVED origin (must NOT get an allow header)"
BAD_ORIGIN_HEADERS=$(curl -sS -i -X OPTIONS "$BASE/api/v1/assessment/answer" \
  -H 'Origin: https://evil.example.com' \
  -H 'Access-Control-Request-Method: POST')
echo "$BAD_ORIGIN_HEADERS" | grep -qi '^Access-Control-Allow-Origin:' \
  && bad "unapproved origin got an Access-Control-Allow-Origin header (should be absent)" \
  || ok "unapproved origin correctly gets no CORS allow header"

# ── [7] Allowlist actually blocks non-VaNi paths ─────────────────────────
# A plain GET 404 here wouldn't prove much — Express itself might 404 an
# unmounted path too, telling us nothing about whether nginx is the one
# blocking it. POST to the generic skill executor for a DIFFERENT skill
# (contact-skill) with no Authorization header is a better probe: if nginx
# is correctly NOT proxying this, nginx's own 404 comes back. If nginx
# mistakenly let it through, Express's auth check fires first and returns
# 401 (not 404) — so 401 here specifically means the allowlist has a hole.
echo
echo "[7] POST a non-VaNi skill path (must 404 at nginx — a 401 would mean it reached Express, i.e. the allowlist has a hole)"
BLOCKED_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/skills/contact-skill/get_contacts")
if [ "$BLOCKED_CODE" = "404" ]; then
  ok "non-VaNi skill path returns 404 (nginx blocked it, never reached Express)"
elif [ "$BLOCKED_CODE" = "401" ]; then
  bad "got 401, not 404 — this means nginx PROXIED the request through to Express (allowlist regex is too broad)"
else
  bad "expected 404, got $BLOCKED_CODE"
fi

echo
echo "────────────────────────────────────────"
echo "PASS: $PASS   FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
