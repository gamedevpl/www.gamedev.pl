export function csvSet(raw: string | undefined, normalize: (entry: string) => string = (entry) => entry): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => normalize(entry.trim()))
      .filter(Boolean),
  );
}
