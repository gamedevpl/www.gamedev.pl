import { useEffect, useState } from 'react';

export function useCliSurfaceEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void fetch('/api/cli/enabled')
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
        setOn(res.ok && body?.enabled === true);
      })
      .catch(() => setOn(false));
  }, []);
  return on;
}
