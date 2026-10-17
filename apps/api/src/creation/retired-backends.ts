// Backends removed from the platform; their stored jobs resolve to none.
const RETIRED_BACKEND_NAMES: ReadonlySet<string> = new Set(['managed:copilot', 'copilot']);

export function isRetiredBackend(name: string | undefined): boolean {
  return name !== undefined && RETIRED_BACKEND_NAMES.has(name);
}
