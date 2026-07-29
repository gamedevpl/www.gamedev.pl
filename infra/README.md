# Infrastructure

Deployment of the gamedev.pl app (web + API) to GCP Cloud Run is fully automated via GitHub Actions (`.github/workflows/deploy.yml`) using GCP Workload Identity Federation (WIF).

Manual or local builds continue to be supported via `infra/deploy-api.sh`.

No Terraform configuration is used or required for this repository.

## Scripts

All are idempotent and **owner-run** — they need `gcloud` authenticated against the
project, which agent tooling can read but not write.

| Script | What it provisions | When to run |
| --- | --- | --- |
| `setup-wif.sh` | Workload Identity Federation for GitHub Actions | Once, before the first deploy |
| `setup-gcp.sh` | Firestore, IAM, session secret, telemetry TTL, snapshot bucket | Once, then after adding a resource it manages |
| `setup-backups.sh` | Firestore PITR + daily export to GCS, export SA and its IAM | Once. **Then drill the restore** — see `docs/runbooks/restore-firestore.md` |
| `setup-monitoring.sh` | Uptime check + alert policies A1–A4, email channel | Once, per `ALERT_EMAIL`. Prints the manual step for A5 (billing budget) |
| `deploy-api.sh` | Manual deploy of the app service | Rarely — CI deploys on merge to `master` |
| `deploy-world.sh` | Manual deploy of the zone host | Rarely; inert unless `ZONE_HOST_URL` is set |

Backups and alerting exist because neither Cloud Run nor Firestore provides them by
default: without `setup-backups.sh` a wrong delete is unrecoverable, and without
`setup-monitoring.sh` an outage is discovered by whoever next opens the site.

## Prerequisites (Owner-Run Setup)

Before `.github/workflows/deploy.yml` can deploy from GitHub Actions, the owner must set up Workload Identity Federation in GCP:

```bash
export PROJECT_ID="gamedevpl"
export POOL_NAME="github-pool"
export PROVIDER_NAME="github-provider"
export REPO="gamedevpl/www.gamedev.pl"
export SA_NAME="github-actions-deployer"

# 1. Create Service Account for GitHub Actions
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deployer" \
  --project="$PROJECT_ID"

export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# 2. Grant required roles to the Service Account
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE"
done

# 3. Create Workload Identity Pool
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="$PROJECT_ID"

export POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" \
  --format="value(name)" \
  --project="$PROJECT_ID")

# 4. Create Workload Identity Provider in the Pool with attribute condition restricting it to gamedevpl/www.gamedev.pl
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project="$PROJECT_ID"

# 5. Bind GitHub repository to the Service Account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" \
  --project="$PROJECT_ID"
```

> **Note:** The Artifact Registry repository (`gamedev` in `europe-central2`) must already exist prior to running deployments. If not already present, bootstrap it by running `infra/deploy-api.sh` once.
>
> If the deploy job fails at `gcloud builds submit` with `forbidden from accessing the bucket [<project>_cloudbuild]`, the WIF deployer service account is missing the `roles/serviceusage.serviceUsageConsumer` and/or storage access that Cloud Build's source upload path needs. Re-run the setup above (or grant those roles manually) and retry the workflow.
