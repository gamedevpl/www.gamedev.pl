/**
 * Turning a game's `controls` string into key/action rows a player can scan.
 *
 * The field is free text an agent authored in the game's SPEC.md frontmatter, and the
 * catalog ships it unprojected, so both delimiters are in live data: semicolon-separated
 * clauses that contain commas of their own ("A/D or Left/Right to steer; W/Up to
 * accelerate; R to restart") and plain comma-separated lists ("Left/Right to move, Space
 * to fire"). Splitting on the semicolon whenever there is one keeps the first shape's
 * clauses whole; falling back to the comma stops the second from rendering as a single
 * run-on line.
 *
 * Each clause is then split once more into the keys and what they do, because "which key
 * does what" is the question the panel exists to answer and a two-column reading answers
 * it far faster than a sentence. The split is deliberately conservative: only the first
 * " to " / " for " counts, and a clause without one is kept whole and rendered across
 * both columns rather than guessed at. A wrong split reads worse than no split.
 *
 * Measured against all 92 published entries (326 clauses): 293 split, and every one of the
 * 33 left whole genuinely has no key/action shape to find — either prose, or the
 * key-space-action form ("W/S pitch") whose first space is not a reliable boundary
 * ("Shift boost / Ctrl cut" would split wrong). An earlier length cap on the key column
 * was removed because it was the only thing keeping real entries like arena-tag's
 * "D-pad or WASD/arrows/IJKL/numpad to run" from splitting.
 */

/** Enough for the longest catalog entry today (292 chars over 8 clauses) with headroom. */
const MAX_ROWS = 14;
/** A clause longer than this is not a control list; it is prose that would blow the card. */
const MAX_ROW_LENGTH = 160;

export interface ControlRow {
  /** The keys, e.g. "A/D or Left/Right". Empty when the clause could not be split. */
  keys: string;
  /** What they do, e.g. "steer". Carries the whole clause when `keys` is empty. */
  action: string;
}

const SEPARATORS = [' to ', ' for '];

function splitClause(clause: string): ControlRow {
  for (const separator of SEPARATORS) {
    const at = clause.indexOf(separator);
    // A clause starting with the separator ("to jump") has no key half worth showing.
    if (at <= 0) continue;
    const keys = clause.slice(0, at).trim();
    const action = clause.slice(at + separator.length).trim();
    if (!keys || !action) break;
    return { keys, action };
  }
  // No separator at all. Prose ("Press A, S, D, F, or Space in sync with...") and the
  // key-space-action shape ("W/S pitch") both land here and keep their own row: splitting
  // the latter on its first space turns "Shift boost / Ctrl cut" into a wrong answer, and
  // a wrong split reads worse than none.
  return { keys: '', action: clause };
}

export function parseControls(controls: string): ControlRow[] {
  const separator = controls.includes(';') ? ';' : ',';
  return controls
    .split(separator)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0)
    .slice(0, MAX_ROWS)
    .map((clause) => (clause.length > MAX_ROW_LENGTH ? `${clause.slice(0, MAX_ROW_LENGTH - 1)}…` : clause))
    .map(splitClause);
}

/* --------------------------------------------------------------------------
 * What the game says about itself
 * ------------------------------------------------------------------------ */

/**
 * A control list a game reported over the player bridge.
 *
 * Better than the catalog's `controls` in four ways that matter: it is already split
 * into key and action (no guessing), it is in the player's language rather than always
 * English, it can name a touch button, and it exists on a `/play/` deep link — where the
 * catalog is never fetched and the placeholder entry carries an empty `controls`.
 *
 * It is also the least trustworthy input on this screen. It crosses a sandbox boundary
 * from an AI-generated document, so nothing here is assumed: shapes are checked, counts
 * and lengths are capped, and every string is rendered as a JSX text node.
 */
export interface ReportedControls {
  /** Key→action rows the game's own how-to-play markup declares. */
  rows: ControlRow[];
  /** Rows GameKit vouches for, which is the only source that can describe touch. */
  kit: ControlRow[];
  /** Whether GameKit reported mounting an on-screen d-pad. */
  pad: boolean;
  /** The game's one-line `.hint`, used only when nothing structured came back. */
  hint: string;
}

/** Longer than a key column ever legitimately is; also the cap on a reported action. */
const MAX_REPORTED_LENGTH = 80;

function cleanField(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // Collapse whitespace before measuring: a game could otherwise spend the whole budget
  // on newlines and push the visible text out of the card.
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanRows(value: unknown): ControlRow[] {
  if (!Array.isArray(value)) return [];
  const out: ControlRow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const keys = cleanField(record.keys, MAX_REPORTED_LENGTH);
    const action = cleanField(record.action, MAX_REPORTED_LENGTH);
    // A row with neither half says nothing; a row with only keys is a key bound to no
    // stated action, which reads as a mistake rather than as help.
    if (!action) continue;
    out.push({ keys, action });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

/**
 * Validates a `controls` message from the player bridge into something renderable.
 *
 * Returns null when the game reported nothing usable, which is the signal to fall back
 * to the catalog string. Deliberately total: any shape at all goes in, and what comes
 * out is either well-formed or null — a hostile or broken frame cannot produce a third
 * outcome, and cannot make the host throw while a game is running.
 */
export function readReportedControls(data: unknown): ReportedControls | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const kitRaw = Array.isArray(record.kit) ? (record.kit as Array<Record<string, unknown>>) : [];
  const controls: ReportedControls = {
    rows: cleanRows(record.rows),
    kit: cleanRows(kitRaw),
    pad: kitRaw.some((entry) => entry && typeof entry === 'object' && typeof entry.pad === 'string' && entry.pad),
    hint: cleanField(record.hint, MAX_ROW_LENGTH),
  };
  const empty = controls.rows.length === 0 && controls.kit.length === 0 && !controls.hint && !controls.pad;
  return empty ? null : controls;
}

/**
 * The rows to show, from the best source that has any.
 *
 * The game's own markup wins over the catalog because it is this game's account of
 * itself rather than a spec claim about it, and it is localized. GameKit's rows are
 * appended rather than merged: they name touch buttons, which the keyboard rows above
 * them never duplicate. The `.hint` is a single sentence, so it is parsed with the same
 * splitter the catalog string uses.
 */
export function resolveControlRows(reported: ReportedControls | null, catalog: string): ControlRow[] {
  const declared = reported ? reported.rows : [];
  const fallback = declared.length > 0 ? declared : parseControls(catalog);
  const hinted = fallback.length > 0 ? fallback : parseControls(reported?.hint ?? '');
  return [...hinted, ...(reported?.kit ?? [])].slice(0, MAX_ROWS);
}
