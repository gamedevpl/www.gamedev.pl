import { useAuth } from './AuthContext.js';
import { InAppGameReport } from './InAppGameReport.js';
import { ReportGameButton } from './ReportGameButton.js';

// One report row. Mailto without an account; the form once signed in.
export function PlayerGameReport({ slug, title }: { slug: string; title: string }) {
  const { user } = useAuth();
  if (!user) return <ReportGameButton slug={slug} title={title} />;
  return <InAppGameReport slug={slug} title={title} />;
}
