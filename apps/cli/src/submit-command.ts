import { formatSubmitLines, submitGame } from './submit.js';
import { updateProgress } from './update-progress.js';
import { CliError, EXIT_RED } from './exit-codes.js';

export async function submitCommand(input: {
  delivery: Parameters<typeof submitGame>[0];
  io: { stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream };
  asJson: boolean;
}): Promise<void> {
  const progress = updateProgress({ stream: input.io.stderr, enabled: !input.asJson });
  const controller = new AbortController();
  const stop = () => controller.abort(new CliError('Delivery stopped. Check Studio before retrying.', EXIT_RED));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const api = input.delivery.api;
  let result;
  try {
    result = await submitGame({
      ...input.delivery,
      abort: controller.signal,
      api: {
        ...api,
        request: (method, path, body, signal) => api.request(method, path, body, signal ?? controller.signal),
      },
      onProgress: progress.stage,
    });
  } finally {
    progress.stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  input.io.stdout.write(
    input.asJson ? `${JSON.stringify(result)}\n` : `${formatSubmitLines(result, input.delivery.slug).join('\n')}\n`,
  );
}
