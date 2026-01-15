# backend/scripts/smoke.sh
set -euo pipefail

API="${API:-http://localhost:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
NC="\033[0m"

pass() { echo -e "${GREEN}PASS${NC} - $*" >&2; }
fail() { echo -e "${RED}FAIL${NC} - $*" >&2; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} - $*" >&2; }
warn() { echo -e "${YELLOW}WARN${NC} - $*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

need_cmd curl

# ✅ python / python3 자동 선택
PY="${PYTHON:-}"
if [[ -z "$PY" ]]; then
  if command -v python >/dev/null 2>&1; then
    PY="python"
  elif command -v python3 >/dev/null 2>&1; then
    PY="python3"
  else
    fail "Missing command: python3 (or python)"
  fi
fi

CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-2}"
CURL_MAX_TIME="${CURL_MAX_TIME:-12}"

http_get() {
  local url="$1"
  curl -sS --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
    -w "\n%{http_code}" "$url"
}

http_post_json() {
  local url="$1"
  local body="$2"
  curl -sS --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
    -X POST "$url" -H "Content-Type: application/json" -d "$body" \
    -w "\n%{http_code}"
}

http_patch_json() {
  local url="$1"
  local body="$2"

  local hdr=()
  if [[ -n "$ADMIN_TOKEN" ]]; then
    hdr=(-H "x-admin-token: $ADMIN_TOKEN")
  fi

  curl -sS --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
    -X PATCH "$url" -H "Content-Type: application/json" "${hdr[@]}" -d "$body" \
    -w "\n%{http_code}"
}

# ✅ split body/code without pipeline subshell issues
split_body_code() {
  local tmp
  tmp="$(cat)"
  CODE="$(echo "$tmp" | tail -n 1)"
  BODY="$(echo "$tmp" | sed '$d')"
}

assert_code_2xx() {
  local code="$1"
  [[ "$code" =~ ^2[0-9]{2}$ ]] || fail "HTTP $code"
}

assert_json() {
  local json="$1"
  JSON="$json" "$PY" -c 'import os, json; json.loads(os.environ.get("JSON",""))' >/dev/null 2>&1 \
    || fail "Response is not valid JSON"
}

assert_json_has_key() {
  local json="$1"
  local key="$2"
  JSON="$json" KEY="$key" "$PY" -c '
import os, json
d=json.loads(os.environ["JSON"])
k=os.environ["KEY"]
if not isinstance(d, dict) or k not in d:
  raise SystemExit(1)
' >/dev/null 2>&1 || fail "JSON missing key: $key"
}

assert_meta_value() {
  local json="$1"
  local field="$2"
  local expected="$3"

  JSON="$json" FIELD="$field" EXPECTED="$expected" "$PY" -c '
import os, json
d=json.loads(os.environ["JSON"])
items = d.get("items") if isinstance(d, dict) else None
if not isinstance(items, list) or not items:
  raise SystemExit("no items")
x = items[0]
f=os.environ["FIELD"]
e=os.environ["EXPECTED"]
v = x.get(f)
if v != e:
  raise SystemExit(f"expected {f}={e}, got {v}")
' >/dev/null 2>&1 || fail "Override assert failed: ${field} != ${expected}"
}

assert_meta_number() {
  local json="$1"
  local field="$2"
  local expected="$3"

  JSON="$json" FIELD="$field" EXPECTED="$expected" "$PY" -c '
import os, json
d=json.loads(os.environ["JSON"])
items = d.get("items") if isinstance(d, dict) else None
if not isinstance(items, list) or not items:
  raise SystemExit("no items")
x = items[0]
f=os.environ["FIELD"]
e=int(os.environ["EXPECTED"])
v = x.get(f)
if v != e:
  raise SystemExit(f"expected {f}={e}, got {v}")
' >/dev/null 2>&1 || fail "Override assert failed: ${field} != ${expected}"
}

info "API = $API"
info "PY  = $PY"
if [[ -n "$ADMIN_TOKEN" ]]; then
  info "ADMIN_TOKEN = (set)"
else
  warn "ADMIN_TOKEN is not set. Admin override test will FAIL unless you export ADMIN_TOKEN."
fi

# 1) GET /home/charts
info "1) GET /home/charts"
tmp="$(http_get "$API/home/charts")"
split_body_code <<< "$tmp"
assert_code_2xx "$CODE"
assert_json "$BODY"
pass "/home/charts OK (HTTP $CODE)"
assert_json_has_key "$BODY" "collections"
pass "/home/charts has collections"

# warn if all empty
empty_count="$(
  JSON="$BODY" "$PY" -c '
import os, json
d=json.loads(os.environ["JSON"])
cols=d.get("collections",[])
def is_empty(c):
  return isinstance(c, dict) and isinstance(c.get("items"), list) and len(c["items"])==0
print(sum(1 for c in cols if is_empty(c)))
' 2>/dev/null || echo "0"
)"
if [[ "${empty_count:-0}" -ge 4 ]]; then
  warn "home charts items are all empty. (snapshot refresh/cron이 아직 안 돌았을 수 있어)"
fi

# 2) POST /meta/batch
info "2) POST /meta/batch (sample ids)"
REQ='[
  {"mediaType":"movie","tmdbId":550},
  {"mediaType":"movie","tmdbId":299536},
  {"mediaType":"tv","tmdbId":1399}
]'
tmp="$(http_post_json "$API/meta/batch" "$REQ")"
split_body_code <<< "$tmp"
assert_code_2xx "$CODE"
assert_json "$BODY"
pass "/meta/batch OK (HTTP $CODE)"
assert_json_has_key "$BODY" "items"
pass "/meta/batch has items"

# 3) PATCH /admin/meta/movie/550
info "3) PATCH /admin/meta/movie/550 (override apply)"
if [[ -z "$ADMIN_TOKEN" ]]; then
  fail "ADMIN_TOKEN env is missing. Export ADMIN_TOKEN=... (and set same in backend .env)"
fi

PATCH='{"ageRating":"19","releaseStatus":"NOW_SHOWING","releaseYear":1999}'
tmp="$(http_patch_json "$API/admin/meta/movie/550" "$PATCH")"
split_body_code <<< "$tmp"
assert_code_2xx "$CODE"
assert_json "$BODY"
pass "admin override PATCH OK (HTTP $CODE)"

# 4) re-fetch and assert override
info "4) POST /meta/batch re-fetch and assert override"
REQ2='[{"mediaType":"movie","tmdbId":550}]'
tmp="$(http_post_json "$API/meta/batch" "$REQ2")"
split_body_code <<< "$tmp"
assert_code_2xx "$CODE"
assert_json "$BODY"
pass "re-fetch /meta/batch OK (HTTP $CODE)"

assert_meta_value "$BODY" "ageRating" "19"
pass "ageRating override applied"
assert_meta_value "$BODY" "releaseStatus" "NOW_SHOWING"
pass "releaseStatus override applied"
assert_meta_number "$BODY" "releaseYear" 1999
pass "releaseYear override applied"

echo >&2
pass "SMOKE TEST COMPLETE ✅"
