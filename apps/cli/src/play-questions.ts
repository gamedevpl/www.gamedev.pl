import type { ApprovalRequest, QuestionAnswers } from 'genaicode/agents';

export const SKIP_QUESTION = 'Skip';

type Ask = (choices: string[], question: string) => Promise<string | undefined>;

// Terminal text for one agent question and its options.
export function questionPrompt(
  name: string,
  question: NonNullable<ApprovalRequest['questions']>[number],
  index: number,
  count: number,
): string {
  const head = count > 1 ? `${name} asks (${index + 1}/${count}):` : `${name} asks:`;
  const lines = question.options.map((option) =>
    option.description ? `• ${option.label} — ${option.description}` : `• ${option.label}`,
  );
  const header = question.header ? `[${question.header}] ` : '';
  return [head, `${header}${question.question}`, ...lines].join('\n');
}

// One pick per question; undefined when the browser answered first.
export async function askQuestions(
  name: string,
  request: ApprovalRequest,
  ask: Ask,
): Promise<QuestionAnswers | undefined> {
  const questions = request.questions ?? [];
  const answers: QuestionAnswers = {};
  // Typed and secret answers need the browser card.
  const pickable = (question: (typeof questions)[number]) => question.options.length > 0 && !question.secret;
  if (!questions.some(pickable)) {
    const text = questions.map((question, index) => questionPrompt(name, question, index, questions.length));
    const choice = await ask([SKIP_QUESTION], [...text, 'Answer it in the browser, or skip it.'].join('\n\n'));
    return choice === undefined ? undefined : answers;
  }
  for (const [index, question] of questions.entries()) {
    if (!pickable(question)) continue;
    const labels = question.options.map((option) => option.label);
    const choice = await ask([...labels, SKIP_QUESTION], questionPrompt(name, question, index, questions.length));
    if (choice === undefined) return undefined;
    if (labels.includes(choice)) answers[question.id] = [choice];
  }
  return answers;
}
