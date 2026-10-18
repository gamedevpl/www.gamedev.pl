import { useState } from 'react';
import type { SubmissionStatus } from '../../submissionApi.js';

export function useStudioPreviewSelection(token: string | null, status: SubmissionStatus | null) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const newestPassedVersion = status?.recentBuilds?.find((build) => build.verdict === 'green')?.version;
  const [context, setContext] = useState({ token, newestPassedVersion });
  const changed = context.token !== token || context.newestPassedVersion !== newestPassedVersion;

  // A historical choice lasts until a newer successful delivery arrives.
  if (changed) {
    setContext({ token, newestPassedVersion });
    setSelectedVersion(null);
  }

  return [changed ? null : selectedVersion, setSelectedVersion] as const;
}
