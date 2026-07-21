# infra

Terraform infrastructure configuration for deploying **www.gamedev.pl** on Google Cloud Platform (GCP).

## Architecture Overview

- **`apps/api`**: Fastify backend deployed on **GCP Cloud Run Service** (`google_cloud_run_v2_service`) with scale-to-zero when idle (`min_instance_count = 0`).
- **`containers/agent-runner`**: Ephemeral **GCP Cloud Run Job** (`google_cloud_run_v2_job`) provisioned per generation request.
- **`apps/web`**: Static frontend hosted on a **Cloud Storage Bucket** (`google_storage_bucket`) with website configuration.
- **Artifact Registry**: Docker container repository (`google_artifact_registry_repository`) holding `api` and `agent-runner` images.
- **Secret Manager**: Secure store (`google_secret_manager_secret`) for OAuth credentials and API secrets.
- **IAM & Service Accounts**: Least-privilege Service Account (`google_service_account`) granting Cloud Run access to Secret Manager.

## Files

- [`main.tf`](./main.tf) — Core GCP provider, Cloud Run service/job, Secret Manager, Storage Bucket, and IAM definitions.
- [`variables.tf`](./variables.tf) — Input variables (`project_id`, `region`, `environment`, `domain_name`).
- [`outputs.tf`](./outputs.tf) — Output endpoints (API URL, static web URL, Artifact Registry repository URI).
- [`terraform.tfvars.example`](./terraform.tfvars.example) — Sample variable configuration file.

## Getting Started

1. Ensure `gcloud` CLI and `terraform` (>= 1.5.0) are installed and authenticated to your GCP project.
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and set your `project_id`:
   ```bash
   cp infra/terraform.tfvars.example infra/terraform.tfvars
   ```
3. Initialize and plan Terraform:
   ```bash
   cd infra
   terraform init
   terraform plan
   ```
4. Apply infrastructure provisioning:
   ```bash
   terraform apply
   ```
