/**
 * Turning a game's `controls` string into rows a player can scan.
 *
 * The field is free text an agent authored in the game's SPEC.md frontmatter, and the
 * catalog ships it unprojected, so both delimiters are in live data: semicolon-separated
 * clauses that contain commas of their own ("A/D or Left/Right to steer; W/Up to
 * accelerate; R to restart") and plain comma-separated lists ("Left/Right to move, Space
 * to fire"). Splitting on the semicolon whenever there is one keeps the first shape's
 * clauses whole; falling back to the comma stops the second from rendering as a single
 * run-on line, which is the whole point of the panel.
 */

/** Enough for the longest catalog entry today (292 chars over 8 clauses) with headroom. */
const MAX_ROWS = 14;
/** A clause longer than this is not a control list; it is prose that would blow the card. */
const MAX_ROW_LENGTH = 160;

export function parseControls(controls: string): string[] {
  const separator = controls.includes(';') ? ';' : ',';
  return controls
    .split(separator)
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .slice(0, MAX_ROWS)
    .map((row) => (row.length > MAX_ROW_LENGTH ? `${row.slice(0, MAX_ROW_LENGTH - 1)}…` : row));
}
