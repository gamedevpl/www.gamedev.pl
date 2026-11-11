// One line for a failover, in the terminal and browser transcript.
export function failoverLine(entry: {
  from: string;
  to: string;
  failure: { kind: string; resetsAt?: number };
}): string {
  const resets =
    entry.failure.resetsAt === undefined
      ? ''
      : `, resets ${new Date(entry.failure.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `! ${entry.from} ran out (${entry.failure.kind}${resets}); ${entry.to} takes over`;
}
