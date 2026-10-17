import { useEffect, useState } from 'react';
import type { SubmissionStatus } from '../../submissionApi.js';

export function useStudioPreviewSelection(token: string | null, status: SubmissionStatus | null) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const newestPassedVersion = status?.recentBuilds?.find((build) => build.verdict === 'green')?.version;

  // A historical choice lasts until a newer successful delivery arrives.
  useEffect(() => {
    setSelectedVersion(null);
  }, [token, newestPassedVersion]);

  return [selectedVersion, setSelectedVersion] as const;
}
