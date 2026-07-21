output "api_service_url" {
  description = "URL of the deployed Fastify API Cloud Run service"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_bucket_url" {
  description = "Static website endpoint URL for Cloud Storage bucket"
  value       = "https://storage.googleapis.com/${google_storage_bucket.web_static.name}/index.html"
}

output "artifact_registry_repo" {
  description = "Docker repository URI for image pushes"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "agent_runner_job_name" {
  description = "Cloud Run Job name for ephemeral agent execution"
  value       = google_cloud_run_v2_job.agent_runner.name
}
