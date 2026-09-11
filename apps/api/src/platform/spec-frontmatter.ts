// Matches the lenient frontmatter format spec.mjs writes; no nested YAML.
export function parseSpecFrontmatter(specMd: string): Record<string, string> {
  const matched = /^---\s*\n([\s\S]*?)\n---/.exec(specMd);
  if (!matched?.[1]) {
    return {};
  }

  const data: Record<string, string> = {};
  for (const line of matched[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) {
      data[key] = value;
    }
  }
  return data;
}

export function parseSpecTitle(specMd: string): string | null {
  return parseSpecFrontmatter(specMd).title || null;
}
