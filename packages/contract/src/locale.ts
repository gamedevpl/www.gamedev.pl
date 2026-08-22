export const LOCALES = ['en', 'pl'] as const;
export type Locale = (typeof LOCALES)[number];
