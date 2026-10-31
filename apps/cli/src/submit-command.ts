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
  process.once('SIGHUP', stop);
  let result;
  try {
    result = await submitGame({
      ...input.delivery,
      abort: controller.signal,
      onProgress: progress.stage,
      warn: input.asJson
        ? undefined
        : (message) => {
            input.io.stderr.write(`\r\u001b[2K${message}\n`);
          },
    });
  } finally {
    progress.stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGHUP', stop);
  }
  input.io.stdout.write(
    input.asJson ? `${JSON.stringify(result)}\n` : `${formatSubmitLines(result, input.delivery.slug).join('\n')}\n`,
  );
}
