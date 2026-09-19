// The kill switch for serving shelves from the mirror document.

// Defaults on; off is the incident lever.
export function shelfReadsFromDocument(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.SHELF_DOCUMENT_READS?.trim().toLowerCase();
  return value !== 'false' && value !== '0';
}
