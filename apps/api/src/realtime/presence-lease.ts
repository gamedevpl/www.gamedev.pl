export function presenceLease(headers: Record<string, unknown>): string | undefined {
  const value = headers['x-presence-lease'];
  return typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : undefined;
}
