export type CheckoutStyle = { tone?: 'red' | 'green' | 'cyan' | 'yellow'; bold?: boolean; quiet?: boolean };

export function checkoutLineStyle(line: string): CheckoutStyle | undefined {
  if (
    /^(?:Working copy:|Local changes|Differences from platform|Changes on platform|Conflicts|Ignored paths blocking pull|Diff:|--- |\+\+\+ )/.test(
      line,
    )
  )
    return { bold: true };
  if (line.startsWith('Working tree clean')) return { tone: 'green' };
  if (/^ {2}(?:modified|new file|deleted|both changed|blocked):/.test(line)) return { tone: 'red' };
  if (line.startsWith('  incoming:')) return { tone: 'cyan' };
  if (line.startsWith('@@ ')) return { tone: 'cyan' };
  if (line.startsWith('+')) return { tone: 'green' };
  if (line.startsWith('-')) return { tone: 'red' };
  if (/^Checkout has no base version|^Round status unavailable:/.test(line)) return { tone: 'yellow' };
  if (/^Platform version:|^Round status:|^ {2}\(use |^Ignored files|^ignored by |^\.git is never uploaded/.test(line))
    return { quiet: true };
  if (line.startsWith(' ')) return {};
  return undefined;
}

export function colorCheckoutLines(lines: string[], color: boolean): string[] {
  if (!color) return lines;
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36 };
  return lines.map((line) => {
    const style = checkoutLineStyle(line);
    const code = style?.tone ? codes[style.tone] : style?.bold ? 1 : style?.quiet ? 2 : undefined;
    return code === undefined ? line : `\u001b[${code}m${line}\u001b[0m`;
  });
}
