/**
 * Links from the product back to the repository.
 *
 * The platform is open source, and bug reports belong in its issue tracker rather than in
 * a mailbox only one person reads: a public issue can be found by the next person with the
 * same problem, and it is what makes the project look alive to someone deciding whether to
 * trust it.
 *
 * Note the deliberate split from `ReportGameButton`, which looks similar and is not. That
 * one is the DSA art. 16 notice-and-action route for *content* — a legal process with an
 * obligation attached. This is "the software misbehaved". Merging them would bury illegal
 * content reports in a bug tracker and drown the bug tracker in content complaints.
 */

export const REPO_URL = 'https://github.com/gamedevpl/www.gamedev.pl';

/** The public issue tracker — general contact and discussion, not just bug reports. */
export const ISSUES_URL = `${REPO_URL}/issues`;

export interface BugReportContext {
  /** The page the reporter was on. */
  where?: string;
  /**
   * The current visit id, which the telemetry pipeline already records server-side. It is
   * what lets a report be diagnosed without asking anyone to paste session details into a
   * public issue — a random per-visit UUID carries no identity of its own.
   */
  visitId?: string | null;
}

/** Builds a prefilled "new issue" URL against the bug report template. */
export function bugReportUrl(context: BugReportContext = {}): string {
  const params = new URLSearchParams({ template: 'bug_report.yml' });
  if (context.where) params.set('where', context.where);
  if (context.visitId) params.set('report-id', context.visitId);
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
