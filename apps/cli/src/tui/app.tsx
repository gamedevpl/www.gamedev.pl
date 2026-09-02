import { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { CLI_BIN } from '../bin-name.js';
import { glyphs } from '../renderer.js';
import type { TuiSession, TuiState } from './session.js';

export function ReplApp({ session, color }: { session: TuiSession; color: boolean }) {
  const [state, setState] = useState<TuiState>(session.get);
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout.rows || 24);
  useEffect(() => session.subscribe(setState), [session]);
  useEffect(() => {
    const onResize = (): void => setRows(stdout.rows || 24);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  useInput((input, key) => {
    if (state.mode === 'busy') return;
    if (key.escape || (key.ctrl && input === 'c')) {
      session.cancel();
      return;
    }
    if (state.mode === 'pick') {
      if (key.upArrow || input === 'k') session.movePick(-1);
      else if (key.downArrow || input === 'j') session.movePick(1);
      else if (key.return) session.submit();
      else if (/^[1-9]$/.test(input)) {
        const index = Number(input) - 1;
        if (index < state.choices.length) {
          session.movePick(index - state.pickIndex);
          session.submit();
        }
      }
      return;
    }
    if (key.return) {
      session.submit();
      return;
    }
    if (key.backspace || key.delete) {
      session.setDraft(state.draft.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input) session.setDraft(state.draft + input);
  });

  const border = color ? 'round' : 'single';
  const accent = color ? 'cyan' : undefined;
  const prompt = glyphs(color).prompt;
  const body = Math.max(4, rows - 7);
  const shown = state.lines.slice(-body);
  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {shown.map((line, index) => (
          <Text key={`${index}:${line.slice(0, 32)}`}>{line}</Text>
        ))}
        {state.live.map((line, index) => (
          <Text key={`live:${index}:${line.slice(0, 32)}`} dimColor>
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" borderStyle={border} borderColor={accent} paddingX={1}>
        <Text dimColor>{CLI_BIN}</Text>
        {state.mode === 'pick' ? (
          state.choices.map((choice, index) => (
            <Text key={`pick:${index}:${choice}`} color={index === state.pickIndex ? accent : undefined}>
              {index === state.pickIndex ? '▸ ' : '  '}
              {choice}
            </Text>
          ))
        ) : state.mode === 'busy' ? (
          <Text dimColor>▸ …</Text>
        ) : (
          <Text>
            {prompt} {state.draft}█
          </Text>
        )}
      </Box>
    </Box>
  );
}
