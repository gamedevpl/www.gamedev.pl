import { agentTranscriptLine } from './transcript-line.js';

export type LineTone = 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | 'magenta';
export type LineStyle = { label: string; tone?: LineTone; quiet?: boolean; space?: boolean };

const FAILURE = new RegExp(
  [
    '^Validation needs changes',
    '^(?:[\\w-]+ ){0,3}failed\\b',
    '^Verification (?:failed|stopped)',
    '^(?:[\\w-]+ ){1,3}stopped(?: \\(exit|:| before| without success| —)',
    '^Agent (?:blocked|rejected)',
    '(?:completion|successful edit) is not confirmed',
    'could not obtain tool permissions',
    'gate did not start',
    '^error:',
    '^Delivery.*blocked',
    '^this game is mid-round',
    '^\\s*- (?:Check \\d+ failed|EDITOR)',
  ].join('|'),
  'i',
);
const NOTICE = new RegExp(
  [
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
  if (agent ? /^Tool failed\b/.test(agent.text) : FAILURE.test(line)) return { label: '!', tone: 'red' };
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
