import { stripVTControlCharacters } from 'node:util';

const FRAMES = ['|', '/', '-', '\\'];

export function updateProgress(input: {
  stream: Pick<NodeJS.WriteStream, 'write' | 'isTTY' | 'columns'>;
  enabled: boolean;
  activity?: (message: string) => void;
}) {
  let label = '';
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const started = Date.now();
  const animated = input.enabled && !input.activity && input.stream.isTTY;
  const draw = () => {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const line = `${FRAMES[frame++ % FRAMES.length]} ${label} (${elapsed}s)`;
    const width = Math.max(1, (input.stream.columns ?? 80) - 1);
    input.stream.write(`\r\u001b[2K${line.slice(0, width)}`);
  };
  return {
    stage(message: string) {
      if (!input.enabled || stopped) return;
      const safe = stripVTControlCharacters(message).replace(/[\p{Cc}\p{Cf}]/gu, ' ');
      if (safe === label) return;
      label = safe;
      if (input.activity) input.activity(label);
      else if (animated) {
        draw();
        if (!timer) {
          timer = setInterval(draw, 100);
          timer.unref?.();
        }
      } else input.stream.write(`${label}\n`);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (animated && label) input.stream.write('\r\u001b[2K');
    },
  };
}
