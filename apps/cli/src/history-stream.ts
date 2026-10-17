import type { Writable } from 'node:stream';

export function historyStream(stream: Writable, onStop: () => void) {
  let listening = false,
    stopped = false,
    closed = false;
  let failure: Error | undefined;
  let pending: (() => void) | undefined;
  const cleanup = () => {
    stream.removeListener('error', onError);
    stream.removeListener('close', onClose);
    listening = false;
  };
  const stop = () => {
    stopped = true;
    onStop();
    pending?.();
  };
  const recordError = (error: Error) => {
    if (
      !['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      )
    )
      failure = error;
    stop();
  };
  const onError = (error: Error) => recordError(error);
  const onClose = () => {
    closed = true;
    stop();
    cleanup();
  };
  return {
    async write(text: string): Promise<boolean> {
      if (stopped) return false;
      if (typeof stream.on !== 'function') {
        stream.write(text);
        return true;
      }
      if (!listening) {
        listening = true;
        stream.on('error', onError);
        stream.once('close', onClose);
      }
      return new Promise<boolean>((resolve) => {
        let flushed = false,
          returned = false,
          needsDrain = false,
          drained = false;
        const settle = () => {
          if (!stopped && !(returned && flushed && (!needsDrain || drained))) return;
          stream.removeListener('drain', onDrain);
          pending = undefined;
          resolve(!stopped);
        };
        const onDrain = () => {
          drained = true;
          settle();
        };
        pending = settle;
        stream.once('drain', onDrain);
        try {
          needsDrain = !stream.write(text, (error) => {
            if (error) recordError(error);
            else {
              flushed = true;
              settle();
            }
          });
          returned = true;
          settle();
        } catch (error) {
          recordError(error as Error);
        }
      });
    },
    finish() {
      if (listening && (!stopped || closed)) cleanup();
      if (failure) throw failure;
    },
  };
}
