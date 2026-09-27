import { beatPresence as beat, leavePresence as leave } from './presenceApi.js';

const pending = new Map<string, Promise<void>>();

function enqueue<T>(slug: string, run: () => Promise<T>): Promise<T> {
  const operation = pending.get(slug)?.then(run, run) ?? run();
  const tail = operation.then(
    () => undefined,
    () => undefined,
  );
  pending.set(slug, tail);
  void tail.finally(() => {
    if (pending.get(slug) === tail) pending.delete(slug);
  });
  return operation;
}

export function beatPresence(slug: string, position: { col: number; row: number } | null, active: () => boolean) {
  return enqueue(slug, () => (active() ? beat(slug, position) : Promise.resolve(null)));
}

export function leavePresence(slug: string): Promise<void> {
  return enqueue(slug, () => leave(slug));
}
