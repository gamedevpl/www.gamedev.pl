#!/usr/bin/env bash
# Provision the worker invoked by the deletion sweep and operator console.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/require-current-checkout.sh"
project="${PROJECT_ID:-gamedevpl}"
region="${REGION:-europe-west1}"
bucket="${GAMES_STORE_BUCKET:-${project}-games-store}"
app="${APP_SA:-gamedev-app@${project}.iam.gserviceaccount.com}"
worker="game-trash-purge@${project}.iam.gserviceaccount.com"
role="gameTrashObjects"

gcloud services enable workflows.googleapis.com workflowexecutions.googleapis.com --project="$project"
if ! gcloud iam service-accounts describe "$worker" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create game-trash-purge --project="$project" --display-name="Game trash worker"
fi
if ! gcloud iam roles describe "$role" --project="$project" >/dev/null 2>&1; then
  gcloud iam roles create "$role" --project="$project" --title="Purge game objects" --permissions=storage.objects.list,storage.objects.delete --stage=GA
fi
gcloud storage buckets add-iam-policy-binding "gs://${bucket}" --project="$project" \
  --member="serviceAccount:${worker}" --role="projects/${project}/roles/${role}" \
  --condition="title=game-trash-prefix,expression=resource.type == 'storage.googleapis.com/Bucket' || resource.name.startsWith('projects/_/buckets/${bucket}/objects/games/')"
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:${worker}" --role=roles/datastore.viewer --condition=None
gcloud workflows deploy game-trash-purge --project="$project" --location="$region" \
  --service-account="$worker" --set-env-vars="GAMES_STORE_BUCKET=${bucket}" --source="$(dirname "${BASH_SOURCE[0]}")/game-trash-workflow.yaml"
number="$(gcloud projects describe "$project" --format='value(projectNumber)')"
workflow="locations/${region}/workflows/game-trash-purge"
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:${app}" --role=roles/workflows.invoker \
  --condition="title=invoke-game-trash,expression=resource.name == 'projects/${project}/${workflow}' || resource.name == 'projects/${number}/${workflow}' || resource.name.startsWith('projects/${project}/${workflow}/executions/') || resource.name.startsWith('projects/${number}/${workflow}/executions/')"
