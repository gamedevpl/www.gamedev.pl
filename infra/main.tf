terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable Required GCP APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "storage.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# 2. Artifact Registry for Container Images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "gamedevpl-containers-${var.environment}"
  description   = "Docker repository for gamedev.pl API and Agent Runner"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}

# 3. Secret Manager for OAuth / API Credentials
resource "google_secret_manager_secret" "oauth_credentials" {
  secret_id = "gamedevpl-oauth-credentials-${var.environment}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

# 4. Service Account for API & Runner Execution
resource "google_service_account" "api_sa" {
  account_id   = "gamedevpl-api-sa-${var.environment}"
  display_name = "Gamedev.pl API Service Account"
}

# Allow Service Account to access OAuth secret
resource "google_secret_manager_secret_iam_member" "oauth_secret_access" {
  secret_id = google_secret_manager_secret.oauth_credentials.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_sa.email}"
}

# 5. Cloud Run Service for Fastify API (apps/api)
resource "google_cloud_run_v2_service" "api" {
  name     = "gamedevpl-api-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api_sa.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/api:latest"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "LLM_PROVIDER"
        value = "container"
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0 # Scale-to-zero when idle
      max_instance_count = 5
    }
  }

  depends_on = [google_project_service.services]
}

# Allow Unauthenticated Invocation for Public API
resource "google_cloud_run_v2_service_iam_member" "public_api_invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 6. Ephemeral Cloud Run Job for Agent Runner (containers/agent-runner)
resource "google_cloud_run_v2_job" "agent_runner" {
  name     = "gamedevpl-agent-runner-${var.environment}"
  location = var.region

  template {
    template {
      service_account = google_service_account.api_sa.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/agent-runner:latest"

        resources {
          limits = {
            cpu    = "2000m"
            memory = "2Gi"
          }
        }
      }
    }
  }

  depends_on = [google_project_service.services]
}

# 7. Cloud Storage Bucket for Static Web Assets (apps/web)
resource "google_storage_bucket" "web_static" {
  name                        = "gamedevpl-web-${var.environment}-${var.project_id}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }
}

# Make Web Bucket Publicly Readable
resource "google_storage_bucket_iam_member" "public_web" {
  bucket = google_storage_bucket.web_static.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
