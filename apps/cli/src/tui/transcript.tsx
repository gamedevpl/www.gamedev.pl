import { lineStyle } from '../transcript-style.js';
import { Box, Text } from 'ink';
import { linkifyTerminalText } from './links.js';
import { isMascotLine, MASCOT_COLOR } from './mascot.js';

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
