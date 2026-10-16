#!/usr/bin/env bash
#
# Egress allow-list for quality-gate builds: a Cloud Build private pool with no public
# egress, peered to a small VPC whose only way out is an allow-list proxy.
# OWNER-RUN: creates a VPC, a VM, a service-networking peering and a worker pool, and
# binds one project role. Nothing here is applied by merging.
#
# Why: the default pool gives a gate run unrestricted egress, and a gate run executes
# candidate code (infra/gate-hardening.md, "Network egress"). Cloud Build YAML cannot
# filter destinations, so the filter has to be the network the worker sits in.
#
# Shape:
#
#   gate-pool (no external IP)  --peering-->  gate-egress VPC
#                                               gate-proxy VM (squid, :3128)
#                                                 --> allow-listed hosts only
#
# Cost: the proxy is an e2-micro with a 10 GB standard disk in us-central1, which is
# what GCP's always-free tier covers (one such VM per billing account). It has its own
# external IP instead of Cloud NAT, which would cost more than the VM. What remains is
# the IP and the pool-to-proxy traffic between regions: a few USD a month. The pool
# itself bills per build minute at the default pool's rate.
#
# The pool gets no default route: workers without an external IP reach only the peered
# VPC's subnets (and Google's own services, which pull the step image). Code that ignores
# HTTPS_PROXY therefore reaches nothing, rather than everything. The proxy accepts only
# CONNECT to port 443 of the names in GATE_ALLOWED_DOMAINS, matched by name with no
# reverse lookups, and only from the pool's range.
#
# What it does not close: the allow-listed hosts are themselves general-purpose services
# (GitHub, npm). A run holds no credential for them, but a determined candidate can still
# talk to them. The list is the "Egress the run actually needs" section of
# gate-hardening.md and nothing more.
#
# Rollout (each step reversible):
#   1. ./infra/setup-gate-egress.sh                      creates everything; gates unaffected
#   2. the egress check build printed at the end           proves allow and deny paths
#   3. repo variables GATE_WORKER_POOL + GATE_EGRESS_PROXY, then deploy
#   Rollback: clear both variables and deploy; the gate returns to the default pool.
#
# Re-runnable: every step is describe-or-create. Changing the allow-list is a re-run with
# a new GATE_ALLOWED_DOMAINS / EXTRA_ALLOWED_DOMAINS; it updates the VM's metadata and
# restarts it (a gate running at that moment fails and can be re-run).
#
# Override via env: PROJECT_ID, REGION, ZONE, NETWORK, SUBNET, SUBNET_RANGE, PROXY_IP,
# POOL, POOL_RANGE, POOL_PREFIX, PROXY_VM, PROXY_MACHINE_TYPE, CANONICAL_HOST,
# GATE_ALLOWED_DOMAINS, EXTRA_ALLOWED_DOMAINS, APP_SA_NAME.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
# The pool: same region as the app and the Artifact Registry repo holding the image.
REGION="${REGION:-europe-west1}"
# The proxy: a free-tier region. The VPC is global, so the pool reaches it over peering.
PROXY_REGION="${PROXY_REGION:-us-central1}"
ZONE="${ZONE:-${PROXY_REGION}-a}"
NETWORK="${NETWORK:-gate-egress}"
SUBNET="${SUBNET:-gate-proxy}"
SUBNET_RANGE="${SUBNET_RANGE:-10.90.0.0/28}"
PROXY_IP="${PROXY_IP:-10.90.0.10}"
POOL="${POOL:-gate-pool}"
POOL_RANGE_NAME="${POOL}-range"
POOL_RANGE="${POOL_RANGE:-10.91.0.0}"
POOL_PREFIX="${POOL_PREFIX:-24}"
PROXY_VM="${PROXY_VM:-gate-proxy}"
PROXY_MACHINE_TYPE="${PROXY_MACHINE_TYPE:-e2-micro}"
PROXY_PORT=3128
CANONICAL_HOST="${CANONICAL_HOST:-www.gamedev.pl}"
# Production path only (gate-hardening.md, items 1-4): the harness clone, `npm ci`,
# candidate reads and signed artifact uploads, and the verdict POST. No apt mirrors and
# no Docker Hub: the from-scratch fallback does not run in this pool.
GATE_ALLOWED_DOMAINS="${GATE_ALLOWED_DOMAINS:-github.com codeload.github.com registry.npmjs.org storage.googleapis.com ${CANONICAL_HOST}}"
EXTRA_ALLOWED_DOMAINS="${EXTRA_ALLOWED_DOMAINS:-}"
ALLOWED="$(echo "$GATE_ALLOWED_DOMAINS $EXTRA_ALLOWED_DOMAINS" | xargs)"
APP_SA_NAME="${APP_SA_NAME:-gamedev-app}"
RUN_SA="${APP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
GATE_SA="gate-runner@${PROJECT_ID}.iam.gserviceaccount.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POOL_NAME="projects/${PROJECT_ID}/locations/${REGION}/workerPools/${POOL}"
PROXY_URL="http://${PROXY_IP}:${PROXY_PORT}"

echo "==> Enabling Compute, Service Networking and Cloud Build APIs"
gcloud services enable compute.googleapis.com servicenetworking.googleapis.com cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

echo "==> Network ${NETWORK} and proxy subnet ${SUBNET} (${SUBNET_RANGE})"
if ! gcloud compute networks describe "$NETWORK" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute networks create "$NETWORK" --project="$PROJECT_ID" --subnet-mode=custom
fi
if ! gcloud compute networks subnets describe "$SUBNET" --region="$PROXY_REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNET" --project="$PROJECT_ID" --region="$PROXY_REGION" \
    --network="$NETWORK" --range="$SUBNET_RANGE" --enable-private-ip-google-access
fi

# The VPC has no other ingress rule, so the proxy's external IP accepts nothing inbound.
echo "==> Firewall: pool -> proxy:${PROXY_PORT}, and IAP SSH for the operator"
if ! gcloud compute firewall-rules describe "${NETWORK}-pool-to-proxy" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "${NETWORK}-pool-to-proxy" --project="$PROJECT_ID" --network="$NETWORK" \
    --direction=INGRESS --action=ALLOW --rules="tcp:${PROXY_PORT}" \
    --source-ranges="${POOL_RANGE}/${POOL_PREFIX}" --target-tags=gate-proxy
fi
# Google's IAP range, so `gcloud compute ssh --tunnel-through-iap` can read squid's log.
if ! gcloud compute firewall-rules describe "${NETWORK}-iap-ssh" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "${NETWORK}-iap-ssh" --project="$PROJECT_ID" --network="$NETWORK" \
    --direction=INGRESS --action=ALLOW --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 --target-tags=gate-proxy
fi

echo "==> Proxy VM ${PROXY_VM} at ${PROXY_IP} (allow-list: ${ALLOWED})"
# Metadata values are space-separated: gcloud splits --metadata on commas.
PROXY_METADATA="gate-allowed-domains=${ALLOWED},gate-pool-range=${POOL_RANGE}/${POOL_PREFIX},enable-oslogin=TRUE"
if ! gcloud compute instances describe "$PROXY_VM" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  # No service account: the proxy calls no Google API, and a VM identity is one more
  # credential next to traffic we do not trust.
  gcloud compute instances create "$PROXY_VM" --project="$PROJECT_ID" --zone="$ZONE" \
    --machine-type="$PROXY_MACHINE_TYPE" --subnet="$SUBNET" --private-network-ip="$PROXY_IP" \
    --boot-disk-type=pd-standard --boot-disk-size=10GB \
    --image-family=debian-12 --image-project=debian-cloud --tags=gate-proxy \
    --no-service-account --no-scopes \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --metadata="$PROXY_METADATA" \
    --metadata-from-file=startup-script="${SCRIPT_DIR}/gate-proxy-startup.sh"
else
  gcloud compute instances add-metadata "$PROXY_VM" --zone="$ZONE" --project="$PROJECT_ID" \
    --metadata="$PROXY_METADATA" \
    --metadata-from-file=startup-script="${SCRIPT_DIR}/gate-proxy-startup.sh"
  # The startup script is what writes squid's config; a reset re-runs it.
  gcloud compute instances reset "$PROXY_VM" --zone="$ZONE" --project="$PROJECT_ID"
fi

echo "==> Service-networking peering for the pool (${POOL_RANGE}/${POOL_PREFIX})"
if ! gcloud compute addresses describe "$POOL_RANGE_NAME" --global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute addresses create "$POOL_RANGE_NAME" --project="$PROJECT_ID" --global \
    --purpose=VPC_PEERING --addresses="$POOL_RANGE" --prefix-length="$POOL_PREFIX" --network="$NETWORK"
fi
if ! gcloud services vpc-peerings list --network="$NETWORK" --project="$PROJECT_ID" --format='value(peering)' \
  | grep -q .; then
  gcloud services vpc-peerings connect --project="$PROJECT_ID" --service=servicenetworking.googleapis.com \
    --ranges="$POOL_RANGE_NAME" --network="$NETWORK"
fi

echo "==> Worker pool ${POOL_NAME}"
# Same caps as the default-pool build (gate-build-spec.ts): e2-highcpu-8. 100 GB is the
# pool's standard disk; a pool build may not set its own machine type or disk.
if ! gcloud builds worker-pools describe "$POOL" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud builds worker-pools create "$POOL" --project="$PROJECT_ID" --region="$REGION" \
    --peered-network="projects/${PROJECT_ID}/global/networks/${NETWORK}" --no-public-egress \
    --worker-machine-type=e2-highcpu-8 --worker-disk-size=100
fi

# Creating a build in a private pool needs workerpools.use on the caller: the app, which
# submits every gate. The gate's own identity needs nothing new.
echo "==> ${RUN_SA} may run builds in the pool"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${RUN_SA}" \
  --role=roles/cloudbuild.workerPoolUser --condition=None >/dev/null

cat <<EOF

Done. Nothing routes through the pool yet. Next, prove both paths with the egress check
(GATE_IMAGE is the GATE_RUNNER_IMAGE the app runs with):

  GATE_IMAGE="\$(gcloud run services describe gamedev-app --region=${REGION} --project=${PROJECT_ID} \\
    --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name=="GATE_RUNNER_IMAGE") | .value')"
  gcloud builds submit --no-source --project=${PROJECT_ID} --region=${REGION} \\
    --worker-pool=${POOL_NAME} \\
    --service-account=projects/${PROJECT_ID}/serviceAccounts/${GATE_SA} \\
    --config=infra/cloudbuild-gate-egress-check.yaml \\
    --substitutions=_IMAGE="\$GATE_IMAGE",_PROXY=${PROXY_URL},_CANONICAL_HOST=${CANONICAL_HOST}

When it passes, set these repository variables and deploy:

  GATE_WORKER_POOL=${POOL_NAME}
  GATE_EGRESS_PROXY=${PROXY_URL}

Denied requests are in squid's log on the VM:
  gcloud compute ssh ${PROXY_VM} --zone=${ZONE} --project=${PROJECT_ID} --tunnel-through-iap \\
    --command='sudo grep DENIED /var/log/squid/access.log | tail -50'
EOF
