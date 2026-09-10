import { Box, Text } from 'ink';
import { linkifyTerminalText } from './links.js';
import { isMascotLine, MASCOT_COLOR } from './mascot.js';

export function lineStyle(line: string): { label: string; tone?: string; quiet?: boolean; space?: boolean } {
  if (line.startsWith('› ')) return { label: 'YOU', tone: 'cyan', space: true };
  if (/^──|^[◆*] gamedevpl/.test(line)) return { label: '◆', tone: 'green', space: true };
  if (/^(?:✓|✔|\* static)|^static ladder green|^delivery accepted/.test(line))
    return { label: 'PASS', tone: 'green', space: true };
  if (
    /^Validation needs changes|^verify failed|^error:|^Tool failed|^Delivery.*blocked|^this game is mid-round|^\s*- (?:Check \d+ failed|EDITOR)/i.test(
      line,
    )
  )
    return { label: '!', tone: 'red' };
  if (/^Sending validation|^No new output|^Warning|^kept locally|^.*permission.*(?:denied|refused)/i.test(line))
    return { label: '!', tone: 'yellow' };
  if (/^verifying|^preparing|^Preparing|^installing/.test(line)) return { label: 'CHECK', tone: 'yellow', space: true };
  if (/^[\w-]+ · (?:Running|Tool:|\+\d+ more)/.test(line) || /^[\w-]+ ▸ [⚙✓]/.test(line))
    return { label: '·', tone: 'blue', quiet: true };
  if (/^[\w-]+ ▸ /.test(line)) return { label: '●', tone: 'magenta' };
  if (/^[\w-]+ · model:/.test(line)) return { label: 'AGENT', tone: 'magenta' };
  if (/^(?:Settings:|Full (?:transcript|diagnostics):|base |local-only:)/.test(line))
    return { label: '·', quiet: true };
  if (/https?:\/\//.test(line)) return { label: '↗', tone: 'cyan' };
  return { label: ' ' };
}

export function RichText({ text, color }: { text: string; color: boolean }) {
  return (
    <Text>
      {text.split(/(`[^`\n]+`|https?:\/\/[^\s<>"']+|\/[a-z][\w-]*\b)/g).map((part, index) => {
        const code = part.startsWith('`') && part.endsWith('`');
        const linked = /^https?:\/\//.test(part);
        const command = /^\/[a-z]/.test(part);
        return (
          <Text key={index} color={color && (code || linked || command) ? 'cyan' : undefined} bold={code || command}>
            {linkifyTerminalText(code ? part.slice(1, -1) : part)}
          </Text>
        );
      })}
    </Text>
  );
}

export function TranscriptLine({ line, previous, color }: { line: string; previous?: string; color: boolean }) {
  if (isMascotLine(line)) return <Text color={color ? MASCOT_COLOR : undefined}>{line}</Text>;
  const style = lineStyle(line);
  const agent = /^([\w-]+)( ▸ | · )/.exec(line);
  const sameSpeaker = agent && previous?.startsWith(`${agent[1]} ▸ `) && line.includes(' ▸ ') && !style.quiet;
  return (
    <Box flexDirection="row" marginTop={style.space || (agent && !sameSpeaker && !style.quiet) ? 1 : 0}>
      <Box width={7} flexShrink={0}>
        <Text color={color ? style.tone : undefined} bold>
          {style.label.padEnd(6)}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text
          dimColor={color && style.quiet}
          bold={style.label === 'YOU' || style.label === 'PASS' || style.label === '◆'}
        >
          {agent ? (
            <>
              <Text bold color={color ? style.tone : undefined}>
                {agent[1]}
              </Text>
              <Text>{agent[2]}</Text>
              <RichText text={line.slice(agent[0].length)} color={color} />
            </>
          ) : (
            <RichText text={line} color={color} />
          )}
        </Text>
      </Box>
    </Box>
  );
}
