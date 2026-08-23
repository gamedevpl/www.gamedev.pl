/**
 * Prior turns in a remix session — what the model needs for "again", "more",
 * and pronouns that only make sense against the conversation so far.
 *
 * Distinct from `session.history`, which is an undo stack of source overrides.
 * These are words, not files.
 */

export type RemixTurn = {
  utterance: string;
  /** English summary when the assistant described what it did. */
  summary?: string;
};

/** Bound the prompt: eight turns is plenty of "again" context without drowning the request. */
export const MAX_REMIX_TURNS = 8;

export function rememberRemixTurn(turns: RemixTurn[], turn: RemixTurn): RemixTurn[] {
  const next = [...turns, turn];
  return next.length > MAX_REMIX_TURNS ? next.slice(next.length - MAX_REMIX_TURNS) : next;
}

/**
 * Block for the model prompt, or empty when there is nothing prior.
 *
 * The latest request is still appended separately by the caller — this is only
 * the backlog, so "again" has something to resolve against.
 */
export function formatRemixTurns(turns: RemixTurn[]): string {
  if (turns.length === 0) return '';
  const lines = turns.map((turn, index) => {
    const reply = turn.summary?.trim() ? `\n   → ${turn.summary.trim().slice(0, 200)}` : '';
    return `${index + 1}. Player: ${turn.utterance.trim().slice(0, 400)}${reply}`;
  });
  return [
    'Earlier in this remix (oldest first). Use this for pronouns and relative',
    'follow-ups ("again", "more", "also", "undo that look") — the latest request',
    'below is what to do *now*:',
    ...lines,
    '',
  ].join('\n');
}
