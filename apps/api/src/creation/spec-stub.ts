import type { SubmissionRecord } from '../platform/store.js';

export function buildSpecStub(record: Pick<SubmissionRecord, 'title' | 'slug' | 'spec' | 'qa'>): string {
  const title = record.title?.replace(/\s+/g, ' ').trim() || record.slug || 'Untitled game';
  const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  const brief = record.spec?.trim();
  const answers = (record.qa ?? []).map((line) => line.trim()).filter(Boolean);
  return [
    '---',
    `title: ${quote(title)}`,
    ...(record.slug ? [`slug: ${quote(record.slug)}`] : []),
    '---',
    '',
    `# ${title}`,
    '',
    brief || 'Describe the game here — what the player does, how a round starts and ends.',
    '',
    ...(answers.length ? ['## Creator clarifications', '', ...answers.map((line) => `- ${line}`), ''] : []),
    '<!-- Add genre, controls and submitted_by to the frontmatter above before publishing. -->',
    '',
  ].join('\n');
}
