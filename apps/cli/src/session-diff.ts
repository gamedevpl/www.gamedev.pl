export type SessionDiff = { id: number; summary: string; lines: string[]; files: string[] };
export type SessionDiffInfo = Omit<SessionDiff, 'lines'>;

export function sessionDiff(text: string, id: number): SessionDiff | undefined {
  if (!text.startsWith('Diff: platform → local\n')) return;
  const lines = text.split('\n');
  const files = lines.flatMap((line, index) => {
    if (!line.startsWith('--- ') || !lines[index + 1]?.startsWith('+++ ')) return [];
    if (index > 0 && lines[index - 1] !== '') return [];
    const next = lines[index + 1]!;
    return [next === '+++ /dev/null' ? line.slice(13) : next.slice(10)];
  });
  if (!files.length) return;
  return {
    id,
    summary: `Diff #${id}: ${files.length} ${files.length === 1 ? 'file' : 'files'} · Ctrl+D to view`,
    lines,
    files,
  };
}
