// Match the media type independently of parameters, never a prefix.
export function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}
