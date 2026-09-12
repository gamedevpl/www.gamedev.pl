import { useEffect, useState } from 'react';
import { Box, Text, type Key } from 'ink';
import { completeSlash } from '../argv.js';
import { BLURB } from '../help.js';
import type { TuiSession, TuiState } from './session.js';

const SESSION_COMMANDS = {
  retry: 'resume a task waiting for builder handoff',
  quit: 'leave this session',
  exit: 'leave this session',
};

export function commandSuggestions(draft: string) {
  if (!/^\/[a-z]*$/i.test(draft)) return [];
  const prefix = draft.slice(1).toLowerCase();
  return [
    ...completeSlash(draft).map((verb) => ({ command: `/${verb}`, description: BLURB[verb] })),
    ...Object.entries(SESSION_COMMANDS)
      .filter(([verb]) => verb.startsWith(prefix))
      .map(([verb, description]) => ({ command: `/${verb}`, description })),
  ].sort((a, b) => a.command.localeCompare(b.command));
}

export function useCommandCompletion(state: TuiState, session: TuiSession) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setIndex(0);
    setDismissed(false);
  }, [state.draft, state.mode]);
  const suggestions =
    state.mode === 'prompt' && !state.draftFromHistory && !dismissed ? commandSuggestions(state.draft) : [];
  const selected = Math.min(index, Math.max(0, suggestions.length - 1));
  const handleKey = (key: Key): boolean => {
    if (!suggestions.length) return false;
    if (key.escape) setDismissed(true);
    else if (key.upArrow || key.downArrow) {
      setIndex((selected + (key.upArrow ? -1 : 1) + suggestions.length) % suggestions.length);
    } else if (key.tab || (key.return && suggestions[selected]!.command !== state.draft)) {
      session.setDraft(`${suggestions[selected]!.command} `);
    } else return false;
    return true;
  };
  return { suggestions, selected, handleKey };
}

export function CommandSuggestions({
  suggestions,
  selected,
  count,
  color,
}: {
  suggestions: ReturnType<typeof commandSuggestions>;
  selected: number;
  count: number;
  color: boolean;
}) {
  const start = Math.max(0, Math.min(selected - Math.floor(count / 2), suggestions.length - count));
  return (
    <Box flexDirection="column" height={count} flexShrink={0} paddingX={2}>
      {suggestions.slice(start, start + count).map((item, offset) => (
        <Text key={item.command} wrap="truncate-end" color={color && start + offset === selected ? 'cyan' : undefined}>
          {start + offset === selected ? '▸ ' : '  '}
          <Text bold={start + offset === selected}>{item.command}</Text>
          <Text dimColor> — {item.description}</Text>
        </Text>
      ))}
    </Box>
  );
}
