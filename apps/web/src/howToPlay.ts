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
    // "Press A, S, D, F, or Space in sync with..." style prose: a key column that long is
    // not a key column, and the row reads better whole.
    if (!keys || !action || keys.length > 28) break;
    return { keys, action };
  }
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
