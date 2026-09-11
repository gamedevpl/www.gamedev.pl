import { CommandSuggestions, useCommandCompletion } from './completion.js';
import { BusyPanel } from './busy.js';
import { useEffect, useState } from 'react';
import { Box, Static, Text, useInput, useStdout } from 'ink';
import { TranscriptLine, RichText } from './transcript.js';
import { CLI_BIN } from '../bin-name.js';
import { glyphs } from '../renderer.js';
import { CLI_VERSION } from '../update.js';
import type { TuiSession, TuiState } from './session.js';

export function ReplApp({
  session,
  color,
  historyOffset = 0,
}: {
  session: TuiSession;
  color: boolean;
  historyOffset?: number;
}) {
  const [state, setState] = useState<TuiState>(session.get);
  const completion = useCommandCompletion(state, session);
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
    if (state.mode === 'busy') {
      if (key.ctrl && input === 'c') session.cancel();
      return;
    }
    if ((key.escape || (!key.ctrl && !key.meta)) && completion.handleKey(key)) return;
    if (key.tab) return;
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
    if (key.upArrow) {
      session.historyPrev();
      return;
    }
    if (key.downArrow) {
      session.historyNext();
      return;
    }
    if (key.return) {
      session.submit();
      return;
    }
    if (key.backspace || key.delete) {
      session.deleteLast();
      return;
    }
    if (!key.ctrl && !key.meta && input) session.setDraft(state.draft + input);
  });

  const border = color ? 'round' : 'single';
  const accent = color ? 'cyan' : undefined;
  const prompt = glyphs(color).prompt;
  const choiceCount = Math.min(state.choices.length, Math.max(1, rows - 10));
  const choiceStart = Math.max(
    0,
    Math.min(state.pickIndex - Math.floor(choiceCount / 2), state.choices.length - choiceCount),
  );
  const suggestionRows = Math.min(completion.suggestions.length, 5, Math.max(0, rows - 9));
  const panelRows = suggestionRows + (state.mode === 'pick' ? choiceCount + 3 : state.mode === 'busy' ? 2 : 3);
  const live = state.localTask
    ? [`Local task: ${state.localTask}`, 'Studio receives your changes after /submit']
    : state.live;
  const liveRows = Math.min(live.length, Math.max(0, rows - panelRows - 4));
  const footer = `${state.identity || CLI_BIN} · ${CLI_VERSION}`;
  return (
    <Box flexDirection="column" width={Math.min(stdout.columns || 80, 110)}>
      <Static items={state.lines.slice(historyOffset)} style={{ width: Math.min(stdout.columns || 80, 110) }}>
        {(line, index) => (
          <TranscriptLine key={index} line={line} previous={state.lines[historyOffset + index - 1]} color={color} />
        )}
      </Static>
      <Box flexDirection="column" height={liveRows} flexShrink={0}>
        {live.slice(0, liveRows).map((line, index) => (
          <Text key={`live:${index}:${line.slice(0, 32)}`} color={color ? 'blue' : undefined} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
      {state.mode === 'busy' ? (
        <BusyPanel activity={state.activity} since={state.busySince} lastOutputAt={state.lastOutputAt} color={color} />
      ) : (
        <Box flexDirection="column" flexShrink={0} borderStyle={border} borderColor={accent} paddingX={1}>
          {state.mode === 'pick' ? (
            <>
              <Text bold color={accent} wrap="truncate-end">
                {state.question || 'Choose an option'}
              </Text>
              {state.choices.slice(choiceStart, choiceStart + choiceCount).map((choice, offset) => {
                const index = choiceStart + offset;
                return (
                  <Text
                    wrap="truncate-end"
                    bold={index === state.pickIndex}
                    key={`pick:${index}:${choice}`}
                    color={index === state.pickIndex ? accent : undefined}
                  >
                    {index === state.pickIndex ? '▸ ' : '  '}
                    {index + 1}. {choice}
                  </Text>
                );
              })}
            </>
          ) : (
            <Text wrap="truncate-start">
              <Text color={accent} bold>
                {prompt}
              </Text>{' '}
              {state.draft ? `${state.draft}█` : <Text dimColor>What would you like to do? /help</Text>}
            </Text>
          )}
        </Box>
      )}
      {suggestionRows > 0 && (
        <CommandSuggestions
          suggestions={completion.suggestions}
          selected={completion.selected}
          count={suggestionRows}
          color={color}
        />
      )}
      <Text dimColor wrap="truncate-end">
        {state.mode === 'pick'
          ? `↑↓ select · Enter · Esc · ${state.pickIndex + 1}/${state.choices.length}`
          : state.mode === 'prompt'
            ? completion.suggestions.length
              ? `↑↓ select · Tab fill · Enter ${completion.suggestions[completion.selected]?.command === state.draft ? 'send' : 'fill'} · Esc hide · ${completion.selected + 1}/${completion.suggestions.length}`
              : 'Enter send · / commands · Tab fill · ↑↓ history'
            : 'Working — input paused'}
      </Text>
      <Text dimColor wrap="truncate-end">
        <RichText text={footer} color={color} />
      </Text>
    </Box>
  );
}
