const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const CSI_OR_OSC = new RegExp(
  `(?:${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|${ESC}[@-Z\\\\-_])`,
  'g',
);
const C0_OTHER_THAN_TAB = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(10)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);

export const MAX_EVENT_LINE = 240;

const TERMINAL_HIDDEN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`,
  'g',
);

export function stripTerminalControls(raw: string): string {
  return raw.replace(CSI_OR_OSC, '').replace(TERMINAL_HIDDEN, '');
}

const PATH_HIDDEN = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`,
  'g',
);

export function sanitizePath(raw: string): string {
  return raw.replace(CSI_OR_OSC, '').replace(PATH_HIDDEN, '');
}

export function sanitizeEventPayload(raw: string, maxLength = MAX_EVENT_LINE): string {
  const stripped = raw.replace(CSI_OR_OSC, '').replace(C0_OTHER_THAN_TAB, ' ');
  const oneLine = stripped.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 1)}…`;
}

export function formatAdapterEvent(adapter: string, payload: string): string {
  return `${adapter} ▸ ${sanitizeEventPayload(payload, Infinity)}`;
}
