export interface LocalizedGameDescription {
  en?: string;
  pl?: string;
}

export function normalizeLocalizedDescription(raw: unknown): LocalizedGameDescription | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const en = typeof (raw as { en?: unknown }).en === 'string' ? (raw as { en: string }).en.trim() : '';
  const pl = typeof (raw as { pl?: unknown }).pl === 'string' ? (raw as { pl: string }).pl.trim() : '';
  if (!en && !pl) return undefined;
  return { ...(en ? { en } : {}), ...(pl ? { pl } : {}) };
}

export function pickGamePageDescription(
  page: { description: string | null; localizedDescription?: LocalizedGameDescription },
  languageCode: string | undefined,
): string | null {
  const language = (languageCode ?? '').toLowerCase().startsWith('pl') ? 'pl' : 'en';
  return (
    page.localizedDescription?.[language]?.trim() || page.localizedDescription?.en?.trim() || page.description || null
  );
}
