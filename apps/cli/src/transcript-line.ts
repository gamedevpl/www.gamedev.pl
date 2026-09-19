export function agentTranscriptLine(line: string): { author: string; text: string; tool: boolean } | undefined {
  const match = /^([\w-]+) ▸ (.*)$/.exec(line);
  return match ? { author: match[1]!, text: match[2]!, tool: /^[⚙✓]/.test(match[2]!) } : undefined;
}
