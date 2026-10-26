export function resolveSeedSource(sources: Map<string, string>, path: string) {
  const source = sources.get(path);
  if (source !== undefined || !path.endsWith('.ts')) return { path, source };
  const index = `${path.slice(0, -'.ts'.length)}/index.ts`;
  const fallback = sources.get(index);
  return fallback === undefined ? { path, source } : { path: index, source: fallback };
}
