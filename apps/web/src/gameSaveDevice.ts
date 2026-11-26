// 2026-11-26: signed-out players get a save in this browser.
const DEVICE_SAVE_PREFIX = 'gdp.save.';

type Reply = (payload: Record<string, unknown>) => void;
type DeviceWrite = { t: 'save:put'; data: string; version: number } | { t: 'save:clear' };

function readDeviceSave(slug: string): { data: string; version: number } | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEVICE_SAVE_PREFIX + slug) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { data, version } = parsed as { data?: unknown; version?: unknown };
    if (typeof data !== 'string') return null;
    return { data, version: typeof version === 'number' && Number.isInteger(version) ? version : 1 };
  } catch {
    return null;
  }
}

// The save:state answer for a signed-out player.
export function deviceSaveState(slug: string): Record<string, unknown> {
  const save = readDeviceSave(slug);
  return { t: 'save:state', available: true, data: save?.data ?? null, version: save?.version ?? 0 };
}

// An empty account slot adopts the browser save; next put migrates.
export function accountSaveState(
  slug: string,
  save: { data: string | null; version: number },
): Record<string, unknown> {
  const device = save.data === null ? readDeviceSave(slug) : null;
  const chosen = device ?? save;
  return { t: 'save:state', available: true, data: chosen.data, version: chosen.version };
}

// The account write succeeded; retire the browser copy for good.
export function accountWriteAck(slug: string): Record<string, unknown> {
  try {
    window.localStorage.removeItem(DEVICE_SAVE_PREFIX + slug);
  } catch {
    // Storage blocked: nothing was kept there to retire.
  }
  return { t: 'save:ack', ok: true };
}

// Applies a put or clear and acks it like the API path.
export function writeDeviceSave(slug: string, message: DeviceWrite, reply: Reply): void {
  try {
    const key = DEVICE_SAVE_PREFIX + slug;
    if (message.t === 'save:put') {
      window.localStorage.setItem(key, JSON.stringify({ data: message.data, version: message.version }));
    } else {
      window.localStorage.removeItem(key);
    }
    reply({ t: 'save:ack', ok: true });
  } catch {
    reply({ t: 'save:ack', ok: false, error: 'device storage unavailable' });
  }
}
