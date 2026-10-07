#!/usr/bin/env bash
# Role-by-role permission smoke test. Boots `wrangler dev` once per simulated role
# (DEV_BYPASS_ROLE) and asserts the expected HTTP status for one endpoint per section.
set -u

PORT=8799
BASE="http://127.0.0.1:${PORT}"

ROUTES=(
  "GET /api/admin/status"
  "GET /api/admin/access-requests/count"
  "GET /api/admin/access-requests"
  "GET /api/admin/log-viewer/logs"
  "GET /api/admin/log-viewer/last-seen"
  "GET /api/admin/users/with-access"
  "GET /api/admin/login-users"
  "GET /api/admin/settings"
)

# expected[role]="status ar-count access-requests logs last-seen access-control login-users settings"
declare -A EXPECTED
EXPECTED[owner]="200 200 200 200 200 200 200 200"
EXPECTED[admin]="200 200 200 200 200 200 200 200"
EXPECTED[editor]="200 200 403 200 200 403 403 403"
EXPECTED[member]="403 403 403 403 403 403 403 403"
EXPECTED[guest]="403 403 403 403 403 403 403 403"

fail=0

for role in owner admin editor member guest; do
  bun x wrangler dev --local --port "$PORT" --var DEV_BYPASS_AUTH:true --var "DEV_BYPASS_ROLE:${role}" >/tmp/wrangler-"$role".log 2>&1 &
  pid=$!
  for _ in $(seq 1 60); do
    curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done

  echo "== role: ${role}"
  read -ra want <<<"${EXPECTED[$role]}"
  i=0
  for route in "${ROUTES[@]}"; do
    method="${route%% *}"
    path="${route#* }"
    got=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "${BASE}${path}")
    if [[ "$got" == "${want[$i]}" ]]; then
      echo "  ok   ${method} ${path} -> ${got}"
    else
      echo "  FAIL ${method} ${path} -> ${got} (want ${want[$i]})"
      fail=1
    fi
    i=$((i + 1))
  done

  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
done

exit "$fail"
