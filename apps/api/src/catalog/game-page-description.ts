export interface LocalizedGameDescription {
  en?: string;
  pl?: string;
}

export function extractSpecDescription(specMd: string | null): string | null {
  if (!specMd) return null;
  const lines = specMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').split(/\r?\n/);
  const paragraph: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    const text = line.trim();
    if (text.startsWith('```')) {
      if (paragraph.length > 0) break;
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (!text) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^(#{1,6})\s+/.test(text) || /^(-{3,}|\*{3,})$/.test(text) || /^([-*]|\d+[.)])\s+/.test(text)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(text);
  }

  return paragraph.length > 0 ? paragraph.join(' ') : null;
}

function flattenProse(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > 0 ? flat : undefined;
}

export function extractManifestDescription(gameJson: string | null): LocalizedGameDescription | null {
  if (!gameJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(gameJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = (parsed as { description?: unknown }).description;
  const single = flattenProse(raw);
  if (single) return { en: single };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const en = flattenProse((raw as { en?: unknown }).en);
  const pl = flattenProse((raw as { pl?: unknown }).pl);
  if (!en && !pl) return null;
  return { ...(en ? { en } : {}), ...(pl ? { pl } : {}) };
}

export function resolveGamePageDescriptions(
  specMd: string | null,
  gameJson: string | null,
): { description: string | null; localizedDescription?: LocalizedGameDescription } {
  const specDescription = extractSpecDescription(specMd);
  const manifestDescription = extractManifestDescription(gameJson);
  const description = manifestDescription?.en ?? specDescription ?? manifestDescription?.pl ?? null;
  if (!manifestDescription) return { description };
  const en = manifestDescription.en ?? specDescription ?? undefined;
  return {
    description,
    localizedDescription: {
      ...(en ? { en } : {}),
      ...(manifestDescription.pl ? { pl: manifestDescription.pl } : {}),
    },
  };
}
