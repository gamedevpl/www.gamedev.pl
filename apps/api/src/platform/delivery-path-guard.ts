// Path refusals are shared with the CLI via `@gamedevpl/contract`.
export { forbiddenDeliveryPathReason } from '@gamedevpl/contract';

export function forbiddenIndexHtmlWriteReason(path: string, content: string): string | null {
  if (path !== 'index.html' || !content.trim()) return null;
  return (
    'index.html cannot be staged or patched — it is generated from GAME.json howToPlay, never hand-authored. ' +
    'Add a valid howToPlay to GAME.json instead: at minimum howToPlay.goal and howToPlay.hint, each a ' +
    '{"en": "...", "pl": "..."} pair (both languages, both non-empty) — that is what the generator requires ' +
    'to produce a playable page; optional controls/scoring/mode add more rows. Without it, the game has no ' +
    'markup and the gate refuses it as unplayable. If an index.html from an earlier round is in the way, ' +
    'call delete_source_file("index.html").'
  );
}
