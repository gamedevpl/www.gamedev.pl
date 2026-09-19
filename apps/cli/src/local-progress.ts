export const PROGRESS_INSTRUCTIONS =
  'Use gamedevpl_local.report_progress({stage, summary}) for meaningful milestones: planning, editing, checking, or blocked. Describe actual work concisely, not tool names or invented percentages. Report phase changes and blockers, not every tool call. If unavailable, give occasional concise progress messages and continue working.';
export const progressTool = {
  name: 'report_progress',
  description: 'Update local task status without marking verification or delivery complete.',
  inputSchema: {
    type: 'object',
    properties: {
      stage: { type: 'string', enum: ['planning', 'editing', 'checking', 'blocked'] },
      summary: { type: 'string', minLength: 1, maxLength: 240 },
    },
    required: ['stage', 'summary'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};
export function progressReporter(report: (text: string, blocked: boolean) => void) {
  let previous = '';
  return (value: Record<string, unknown>) => {
    if (
      Object.keys(value).some((key) => !['stage', 'summary'].includes(key)) ||
      typeof value.stage !== 'string' ||
      !['planning', 'editing', 'checking', 'blocked'].includes(value.stage) ||
      typeof value.summary !== 'string' ||
      !value.summary.trim() ||
      value.summary.length > 240 ||
      /[\p{Cc}\p{Cf}]/u.test(value.summary)
    )
      throw new Error('Expected a valid stage and a single-line summary of 1–240 characters.');
    const summary = value.stage + ': ' + value.summary.trim();
    if (summary !== previous) {
      previous = summary;
      report(summary, value.stage === 'blocked');
    }
    return { accepted: true };
  };
}
