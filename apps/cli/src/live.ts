export function renderLive(live: readonly string[], width: number): string {
  const cap = Math.max(1, width);
  return live.map((line) => (line.length <= cap ? line : `${line.slice(0, Math.max(1, cap - 1))}…`)).join('\n');
}

export function createLiveScreen(stdout: NodeJS.WritableStream, width = 80) {
  let paintedRows = 0;
  return {
    paint(lines: readonly string[]) {
      const text = renderLive(lines, width);
      const nextRows = text ? text.split('\n').length : 0;
      let out = '';
      if (paintedRows > 0) out += `\x1b[${paintedRows}A\x1b[J`;
      if (text) out += `${text}\n`;
      stdout.write(out);
      paintedRows = nextRows;
    },
  };
}
