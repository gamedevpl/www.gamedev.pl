#!/usr/bin/env bash
#
# Delete old Firebase Hosting versions, keeping the newest KEEP finalized ones and,
# always, whatever the site currently serves.
#
# Hosting keeps every version ever deployed and bills storage over the free tier, so
# without this the deploy path grows a bill nobody looks at. Storage was 428.8 MB of
# 10 GB on 2026-09-09 — this exists to keep that number flat, not to rescue it.
#
# Runs in deploy.yml after the Hosting upload, and by hand:
#   ./infra/prune-hosting-versions.sh --dry-run
#   KEEP=20 ./infra/prune-hosting-versions.sh
#
# Needs roles/firebasehosting.admin (the deploy service account has it) and an
# authenticated gcloud.
set -euo pipefail

SITE="${HOSTING_SITE:-gamedevpl}"
PROJECT_ID="${PROJECT_ID:-gamedevpl}"
KEEP="${KEEP:-10}"
API="https://firebasehosting.googleapis.com/v1beta1"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

TOKEN="$(gcloud auth print-access-token)"
if [ -z "$TOKEN" ]; then
  echo "Error: no access token — is gcloud authenticated?" >&2
  exit 1
fi

# firebasehosting.googleapis.com refuses a request with no quota project — both for a
# user's ADC and for the deploy service account, which holds
# roles/serviceusage.serviceUsageConsumer for exactly this.
api_get() {
  curl -sS --fail-with-body -H "Authorization: Bearer ${TOKEN}" -H "x-goog-user-project: ${PROJECT_ID}" "$1"
}

# The released version must survive regardless of age: a site whose live version is
# deleted serves nothing.
LIVE="$(api_get "${API}/sites/${SITE}/releases?pageSize=1" \
  | python3 -c 'import json,sys; print((json.load(sys.stdin).get("releases") or [{}])[0].get("version",{}).get("name",""))')"
if [ -z "$LIVE" ]; then
  echo "Error: could not read the live release for site '${SITE}'. Refusing to delete anything." >&2
  exit 1
fi
echo "Live version: ${LIVE}"

# One page of 100 is more than the deploy cadence produces between prunes; a partial
# read only means fewer deletions this run, never a wrong one.
VERSIONS_JSON="$(api_get "${API}/sites/${SITE}/versions?pageSize=100&filter=status%3D%22FINALIZED%22")"

# The JSON travels in the environment, not on stdin: a heredoc *is* stdin, so a piped
# payload would be silently replaced by the script text.
DOOMED="$(KEEP="$KEEP" LIVE="$LIVE" VERSIONS_JSON="$VERSIONS_JSON" python3 - <<'PY'
import json, os

keep = int(os.environ["KEEP"])
live = os.environ["LIVE"]
versions = [v for v in (json.loads(os.environ["VERSIONS_JSON"]).get("versions") or []) if v.get("status") == "FINALIZED"]
versions.sort(key=lambda v: v.get("createTime", ""), reverse=True)
survivors = {v["name"] for v in versions[:keep]} | {live}
for version in versions[keep:]:
    if version["name"] not in survivors:
        print(version["name"])
PY
)"

if [ -z "$DOOMED" ]; then
  echo "Nothing to prune: ${SITE} has at most ${KEEP} finalized versions besides the live one."
  exit 0
fi

COUNT="$(printf '%s\n' "$DOOMED" | wc -l | tr -d ' ')"
echo "Pruning ${COUNT} version(s), keeping the newest ${KEEP} and the live one:"
printf '%s\n' "$DOOMED" | sed 's/^/    /'

if [ "$DRY_RUN" = "1" ]; then
  echo "(--dry-run: deleted nothing)"
  exit 0
fi

printf '%s\n' "$DOOMED" | while read -r VERSION; do
  [ -n "$VERSION" ] || continue
  curl -sS --fail-with-body -X DELETE -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT_ID}" "${API}/${VERSION}" >/dev/null
  echo "    deleted ${VERSION}"
done

echo "Done. Storage frees asynchronously; the console can lag a few minutes."
