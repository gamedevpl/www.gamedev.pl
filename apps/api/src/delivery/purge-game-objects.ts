import { setTimeout as delay } from 'node:timers/promises';
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
type Execution = { name: string; state: string; result?: string };

// Only this workflow's identity can delete immutable version objects.
export async function runTrashWorkflow(bucket: string, slug: string): Promise<void> {
  const workflow = process.env.GAME_TRASH_WORKFLOW;
  if (!workflow || !/^projects\/[\w-]+\/locations\/[\w-]+\/workflows\/[\w-]+$/.test(workflow)) {
    throw new Error('game trash workflow is not configured');
  }
  const client = await auth.getClient();
  const url = `https://workflowexecutions.googleapis.com/v1/${workflow}/executions`;
  const { data } = await client.request<Execution>({
    url,
    method: 'POST',
    data: { argument: JSON.stringify({ bucket, slug }) },
  });
  const executionId = data.name.split('/').pop();
  if (!executionId || !/^[\w-]+$/.test(executionId)) throw new Error('invalid workflow execution');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = await client.request<Execution>({ url: `${url}/${executionId}` });
    if (result.data.state === 'SUCCEEDED') {
      if (result.data.result !== JSON.stringify(slug)) throw new Error('game trash workflow did not confirm the slug');
      return;
    }
    if (!['QUEUED', 'ACTIVE'].includes(result.data.state)) throw new Error('game trash workflow failed');
    await delay(1500);
  }
  throw new Error('game trash workflow still running');
}
