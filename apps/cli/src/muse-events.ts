type MuseEvent = {
  payload_type?: string;
  payload?: { text?: unknown; reason?: unknown; event?: { operation?: unknown } };
};

export function museEventText(value: unknown): string | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const event = value as MuseEvent;
  if (typeof event.payload_type !== 'string') return undefined;
  const payload = event.payload;
  const text = typeof payload?.text === 'string' ? payload.text : null;
  if (event.payload_type === 'run.lifecycle.started') return 'Task started';
  if (event.payload_type === 'task.lifecycle.side_effect_intent') {
    const operation = payload?.event?.operation;
    if (typeof operation !== 'string') return null;
    return operation.startsWith('model.') ? 'Waiting for model response' : `⚙ ${operation}`;
  }
  if (event.payload_type === 'run.output.delta') return text;
  if (event.payload_type.startsWith('run.terminal.')) {
    if (event.payload_type === 'run.terminal.completed') return text;
    const reason = typeof payload?.reason === 'string' ? payload.reason : text;
    return `Task ${event.payload_type.slice('run.terminal.'.length)}${reason ? `: ${reason}` : ''}`;
  }
  return null;
}

export function createMuseStream(): (line: string) => string | null | undefined {
  let buffered = '';
  let streamed = false;
  return (line) => {
    let event: MuseEvent;
    try {
      event = JSON.parse(line) as MuseEvent;
    } catch {
      return undefined;
    }
    const text = museEventText(event);
    if (event?.payload_type === 'run.output.delta' && text) {
      streamed = true;
      buffered += text;
      const end = buffered.lastIndexOf('\n') + 1;
      if (!end && buffered.length < 240) return null;
      const shown = end ? buffered.slice(0, end) : buffered;
      buffered = end ? buffered.slice(end) : '';
      return shown.trim() || null;
    }
    if (event?.payload_type?.startsWith('run.terminal.')) {
      const remainder = buffered.trim();
      buffered = '';
      if (event.payload_type === 'run.terminal.completed' && streamed) return remainder || null;
      return [remainder, text].filter(Boolean).join('\n') || null;
    }
    return text;
  };
}
