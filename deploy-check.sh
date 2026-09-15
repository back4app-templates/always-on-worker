#!/usr/bin/env bash
# Stack: bash | Verifies a deployed worker: health → signed webhook accepted → unsigned rejected → stats.
set -euo pipefail
BASE="${1:?usage: deploy-check.sh <base-url>}"; SECRET="${WEBHOOK_SECRET:?export WEBHOOK_SECRET}"
BODY='{"action":"opened","number":1}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"
echo "1/4 health";   curl -fsS "$BASE/healthz" | grep -q '"ok":true'
echo "2/4 webhook";  curl -fsS -X POST -H "Content-Type: application/json" -H "X-GitHub-Event: pull_request" -H "X-Hub-Signature-256: $SIG" -d "$BODY" "$BASE/webhook" | grep -q stored
echo "3/4 unsigned"; [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d "$BODY" "$BASE/webhook")" = "401" ]
echo "4/4 stats";    curl -fsS "$BASE/stats"; echo; echo "OK"
