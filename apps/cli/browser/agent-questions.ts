import type { AppAgentState } from 'genaicode/react';

function questionText(input: unknown): string {
  if (!input || typeof input !== 'object' || !('questions' in input) || !Array.isArray(input.questions)) return '';
  return input.questions
    .flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || !('question' in item) || typeof item.question !== 'string') return [];
      const options = 'options' in item && Array.isArray(item.options) ? item.options : [];
      const choices = options.flatMap((option: unknown) => {
        if (!option || typeof option !== 'object' || !('label' in option) || typeof option.label !== 'string')
          return [];
        const description = 'description' in option && typeof option.description === 'string' ? option.description : '';
        return [`• ${option.label}${description ? ` — ${description}` : ''}`];
      });
      return [[item.question, ...choices].join('\n')];
    })
    .join('\n\n');
}

export function showAgentQuestions(state: AppAgentState): AppAgentState {
  const turns = (items: AppAgentState['history']) =>
    items.map((turn) => ({
      ...turn,
      entries: turn.entries.map((entry) => {
        if (entry.kind !== 'tool' || entry.name !== 'AskUserQuestion') return entry;
        const question = questionText(entry.input);
        if (!question) return entry;
        return {
          ...entry,
          input: question.split('\n')[0],
          output: [question, entry.output].filter(Boolean).join('\n\n'),
        };
      }),
    }));
  return {
    ...state,
    history: turns(state.history),
    session: state.session ? { ...state.session, turns: turns(state.session.turns) } : null,
  };
}
