import { agentTranscriptLine } from './transcript-line.js';

export type LineTone = 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | 'magenta';
export type LineStyle = { label: string; tone?: LineTone; quiet?: boolean; space?: boolean };

// Failure words in the first clause, before any `.;:—` explanation.
const FIRST_CLAUSE = '^[^.;:—]{0,80}?';
const FAILURE = new RegExp(
  [
    FIRST_CLAUSE +
      "\\b(?:cannot|can't|could not|couldn't|unable to|failed|refused|rejected|not (?:deliverable|allowed|permitted))\\b",
    '^illegal path:',
    '^Validation needs changes',
    '^Verification (?:failed|stopped)',
    '^(?:[\\w-]+ ){1,3}stopped(?: \\(exit|:| before| without success| —)',
    '^Agent (?:blocked|rejected)',
    '(?:completion|successful edit) is not confirmed',
    'gate did not start',
    '^error:',
    '^next: ',
    '^Delivery.*blocked',
    '^this game is mid-round',
    '^\\s*- (?:Check \\d+ failed|EDITOR)',
  ].join('|'),
  'i',
);
const NOTICE = new RegExp(
  [
    FIRST_CLAUSE + '\\b(?:unavailable|conflict)\\b',
    '^Update available:',
    '^Sending validation',
    '^No new output',
    '^Warning',
    '^kept locally',
    '^Delivery (?:outcome unknown|paused)',
    'does not confirm delivery',
    '^[^▸]*timed out',
    '^.*permission.*(?:denied|refused)',
  ].join('|'),
  'i',
);

export function lineStyle(line: string): LineStyle {
  if (line.startsWith('› ')) return { label: 'YOU', tone: 'cyan', space: true };
  if (/^──|^[◆*] gamedevpl/.test(line)) return { label: '◆', tone: 'green', space: true };
  if (/^(?:✓|✔|\* static)|^static ladder green|^delivery accepted/.test(line))
    return { label: 'PASS', tone: 'green', space: true };
  const agent = agentTranscriptLine(line);
  // `0 failed` is a pass; lookbehind breaks Safari 16.0–16.3.
  const failure = agent ? /^Tool failed\b/.test(agent.text) : FAILURE.test(line.replace(/\b0 failed\b/gi, '0 ok'));
  if (failure) return { label: '!', tone: 'red' };
  if (NOTICE.test(line)) return { label: '!', tone: 'yellow' };
  if (/^verifying|^preparing|^Preparing|^installing/.test(line)) return { label: 'CHECK', tone: 'yellow', space: true };
  if (/^[\w-]+ · (?:Running|Tool:|\+\d+ more)/.test(line) || agent?.tool)
    return { label: '·', tone: 'blue', quiet: true };
  if (agent) return { label: '●', tone: 'magenta' };
  if (/^[\w-]+ · model:/.test(line)) return { label: 'AGENT', tone: 'magenta' };
  if (/^(?:Settings:|Full (?:transcript|diagnostics):|base |local-only:)/.test(line))
    return { label: '·', quiet: true };
  if (/https?:\/\//.test(line)) return { label: '↗', tone: 'cyan' };
  return { label: ' ' };
}
