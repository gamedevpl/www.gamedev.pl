// Pixel blob from idle spans, half-blocks.
export const MASCOT_ASCII = [
  '         ▄▄█████████████▄▄',
  '       ▄██████▀ ▄██ ███████▄',
  '       █████████████████████▄',
  '      █████████▀   ▀█████████',
  ' ▄▄██▄███▀ ███▀     ▀███▀ ███▄██▄▄',
  '██▀██▀███   ▀▀        ▀   ███▀██▀█▄',
  '█████████                 ██████▄██',
  '██▄██▄███                 ███▄██▄█▀',
  ' ▀▀██████    ▄        ▄   ██████▀▀',
  '   ▄▄████▄  ███▄    ▄██▄  █████▄',
  '  ██▀█████▄▄█████▄▄█████▄█████▀██',
  ' ██   ▀█████████████████████▀  ██▄',
  ' ██     ▀▀█████▀▀▀▀▀████▀▀▀    ▀██',
  '          █████     ████',
  '           ▀█▀      ▀██▀',
].join('\n');

export const MASCOT_COLOR = '#00e4ac';

const MASCOT_LINES = new Set(MASCOT_ASCII.split('\n'));

export function isMascotLine(line: string): boolean {
  return MASCOT_LINES.has(line);
}
