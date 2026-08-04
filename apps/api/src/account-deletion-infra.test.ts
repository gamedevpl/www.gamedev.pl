import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const deployScript = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');
const setupScript = readFileSync(new URL('../../../infra/setup-account-deletion.sh', import.meta.url), 'utf8');
const gcpSetup = readFileSync(new URL('../../../infra/setup-gcp.sh', import.meta.url), 'utf8');

describe('account deletion infrastructure', () => {
  it('derives the OIDC audience and caller in both deployment paths', () => {
    expect(workflow).toContain(
      'ACCOUNT_DELETION_SWEEP_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app/api/internal/account-deletion-sweep"',
    );
    expect(workflow).toContain('NOTIFY_SWEEP_SA=${SWEEP_SA}');
    expect(workflow).toContain('ACCOUNT_DELETION_SWEEP_AUDIENCE=${ACCOUNT_DELETION_SWEEP_URL}');
    expect(workflow).not.toContain('vars.ACCOUNT_DELETION_SWEEP_AUDIENCE');

    expect(deployScript).toContain(
      'ACCOUNT_DELETION_SWEEP_AUDIENCE="${ACCOUNT_DELETION_SWEEP_AUDIENCE:-${SERVICE_URL}/api/internal/account-deletion-sweep}"',
    );
    expect(deployScript).toContain(
      'NOTIFY_SWEEP_SA="${NOTIFY_SWEEP_SA:-notify-sweep@${PROJECT_ID}.iam.gserviceaccount.com}"',
    );
  });

  it('reconciles the scheduler instead of requiring a one-shot create command', () => {
    expect(setupScript).toContain('reconcile_scheduler_job()');
    expect(setupScript).toContain('for attempt in $(seq 1 30)');
    expect(setupScript).toContain('if reconcile_scheduler_job; then');
    expect(setupScript).toContain('gcloud scheduler jobs describe "$JOB_NAME"');
    expect(setupScript).toContain('gcloud scheduler jobs update http "$JOB_NAME"');
    expect(setupScript).toContain('gcloud scheduler jobs create http "$JOB_NAME"');
    expect(setupScript).toContain('--oidc-service-account-email "$SWEEP_SA"');
    expect(setupScript).toContain('--oidc-token-audience "$SWEEP_URL"');
    expect(setupScript).not.toContain('Waiting for the identity to propagate');
  });

  it('is part of the normal project bootstrap', () => {
    expect(gcpSetup).toContain('"$SCRIPT_DIR/setup-account-deletion.sh"');
  });
});
