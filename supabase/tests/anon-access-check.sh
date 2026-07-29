#!/usr/bin/env bash
# Live anonymous-access checks over HTTP (REST + Storage) using the
# publishable/anon key. Complements supabase/tests/security-hardening-2c3d.sql,
# whose SET ROLE sections require a privileged database connection.
#
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<key> \
#     bash supabase/tests/anon-access-check.sh
#
# Read-only apart from write attempts that MUST be rejected; nothing is
# left behind because every write is denied.

set -uo pipefail
: "${SUPABASE_URL:?SUPABASE_URL required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required}"

FAILURES=0
H=(-H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")

check() { # name expected actual
  if [ "$2" != "$3" ]; then
    echo "FAIL: $1 expected HTTP $2, got $3"
    FAILURES=$((FAILURES + 1))
  else
    echo "PASS: $1 (HTTP $3)"
  fi
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

for t in collections collection_images generated_images generated_image_assets \
         generation_jobs generation_job_items; do
  check "anon select $t" 401 \
    "$(code "${SUPABASE_URL}/rest/v1/${t}?select=id&limit=1" "${H[@]}")"
done

check "anon insert collections" 401 "$(code -X POST "${SUPABASE_URL}/rest/v1/collections" \
  "${H[@]}" -H 'Content-Type: application/json' -d '{"name":"anon-test"}')"

check "anon safety audit rpc" 401 "$(code -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/report_current_generation_safety_state" \
  "${H[@]}" -H 'Content-Type: application/json' -d '{"p_limit":1}')"

check "anon regeneration rpc" 401 "$(code -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/create_matching_collection_regeneration" \
  "${H[@]}" -H 'Content-Type: application/json' \
  -d '{"p_source_item_id":"00000000-0000-0000-0000-000000000000"}')"

for b in generated-images print-exports; do
  check "anon upload ${b}" 400 "$(code -X POST \
    "${SUPABASE_URL}/storage/v1/object/${b}/anon-test.txt" \
    "${H[@]}" -H 'Content-Type: text/plain' --data 'x')"
done

if [ "$FAILURES" -ne 0 ]; then
  echo "${FAILURES} anonymous-access check(s) FAILED"
  exit 1
fi
echo "All anonymous-access checks passed"
