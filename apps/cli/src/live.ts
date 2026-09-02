export function renderLive(live: readonly string[], width: number): string {
  const cap = Math.max(0, width);
  return live
    .map((line) => {
      if (line.length <= cap) return line;
      if (cap <= 1) return line.slice(0, cap);
      return `${line.slice(0, cap - 1)}…`;
    })
    .join('\n');
}

export function createLiveScreen(stdout: NodeJS.WritableStream, width?: number) {
  let paintedRows = 0;
  return {
    paint(lines: readonly string[]) {
      const columns =
        width ??
        ('columns' in stdout && typeof stdout.columns === 'number' && stdout.columns > 0 ? stdout.columns : 80);
      const text = renderLive(lines, columns);
      const nextRows = text ? text.split('\n').length : 0;
      let out = '';
      if (paintedRows > 0) out += `\x1b[${paintedRows}A\x1b[J`;
      if (text) out += `${text}\n`;
      stdout.write(out);
      paintedRows = nextRows;
    },
  };
}
