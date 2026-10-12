import { Transform } from 'node:stream';

export function frameInput(input: string): { frames: string[]; pending: string } {
  const frames: string[] = [];
  let offset = 0;
  while (offset < input.length) {
    const start = input.indexOf('\u001b', offset);
    if (start < 0) {
      frames.push(input.slice(offset));
      break;
    }
    if (start > offset) frames.push(input.slice(offset, start));
    let tag = start + 1;
    while (input[tag] === '\u001b') tag++;
    if (tag === input.length) return { frames, pending: input.slice(start) };
    if (input[tag] === '[') {
      let end = tag + 1;
      while (end < input.length && (input.charCodeAt(end) < 0x40 || input.charCodeAt(end) > 0x7e)) end++;
      if (end === input.length) return { frames, pending: input.slice(start) };
      if (end === tag + 1 && input[end] === 'M') {
        if (end + 3 >= input.length) return { frames, pending: input.slice(start) };
        end += 3;
      }
      offset = end + 1;
    } else if (input[tag] === 'O') {
      if (tag + 1 === input.length) return { frames, pending: input.slice(start) };
      offset = tag + 2;
    } else offset = tag + 1;
    frames.push(input.slice(start, offset));
  }
  return { frames, pending: '' };
}

export function bufferTerminalInput(source: NodeJS.ReadStream) {
  const previousEncoding = source.readableEncoding;
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stream = Object.assign(
    new Transform({
      decodeStrings: false,
      readableObjectMode: true,
      transform(chunk: string | Buffer, _encoding, done) {
        clearTimeout(timer);
        const framed = frameInput(pending + (typeof chunk === 'string' ? chunk : chunk.toString('latin1')));
        pending = framed.pending;
        for (const frame of framed.frames) this.push(Buffer.from(frame, 'latin1'));
        if (pending) {
          // Escape needs a deadline because it is also a standalone key.
          timer = setTimeout(() => {
            this.push(Buffer.from(pending, 'latin1'));
            pending = '';
          }, 100);
          timer.unref();
        }
        done();
      },
      destroy(error, done) {
        clearTimeout(timer);
        pending = '';
        done(error);
      },
    }),
    {
      isTTY: source.isTTY,
      setRawMode: (enabled: boolean) => source.setRawMode(enabled),
      ref: () => source.ref(),
      unref: () => source.unref(),
    },
  );
  // Keep physical bytes intact before Ink configures its own input stream.
  source.setEncoding('latin1');
  source.pipe(stream);
  return {
    stdin: stream as unknown as NodeJS.ReadStream,
    hasPending: () => Boolean(pending),
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      source.unpipe(stream);
      stream.destroy();
      source.setEncoding(previousEncoding ?? 'utf8');
    },
  };
}
