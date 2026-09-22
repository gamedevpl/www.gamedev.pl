import { agentTranscriptLine } from './transcript-line.js';

export type LineTone = 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | 'magenta';
export type LineStyle = { label: string; tone?: LineTone; quiet?: boolean; space?: boolean };

export function lineStyle(line: string): LineStyle {
  if (line.startsWith('› ')) return { label: 'YOU', tone: 'cyan', space: true };
  if (/^──|^[◆*] gamedevpl/.test(line)) return { label: '◆', tone: 'green', space: true };
  if (/^(?:✓|✔|\* static)|^static ladder green|^delivery accepted/.test(line))
    return { label: 'PASS', tone: 'green', space: true };
  if (
    /^Validation needs changes|^verify failed|^Agent blocked:|^error:|^Tool failed|^Delivery.*blocked|^this game is mid-round|^\s*- (?:Check \d+ failed|EDITOR)/i.test(
      line,
    )
  )
    return { label: '!', tone: 'red' };
  if (
    /^Update available:|^Sending validation|^No new output|^Warning|^kept locally|^.*permission.*(?:denied|refused)/i.test(
      line,
    )
  )
    return { label: '!', tone: 'yellow' };
  if (/^verifying|^preparing|^Preparing|^installing/.test(line)) return { label: 'CHECK', tone: 'yellow', space: true };
  if (/^[\w-]+ · (?:Running|Tool:|\+\d+ more)/.test(line) || agentTranscriptLine(line)?.tool)
    return { label: '·', tone: 'blue', quiet: true };
  if (agentTranscriptLine(line)) return { label: '●', tone: 'magenta' };
  if (/^[\w-]+ · model:/.test(line)) return { label: 'AGENT', tone: 'magenta' };
  if (/^(?:Settings:|Full (?:transcript|diagnostics):|base |local-only:)/.test(line))
    return { label: '·', quiet: true };
  if (/https?:\/\//.test(line)) return { label: '↗', tone: 'cyan' };
  return { label: ' ' };
}
