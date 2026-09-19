import { useEffect, useState } from 'react';

export type DesiredOrientation = 'any' | 'portrait' | 'landscape' | 'adaptive';

export function useOrientationMismatch(desired: DesiredOrientation): boolean {
  const [mismatched, setMismatched] = useState(false);

  useEffect(() => {
    if (
      desired === 'any' ||
      desired === 'adaptive' ||
      typeof matchMedia !== 'function' ||
      !matchMedia('(pointer: coarse)').matches
    ) {
      setMismatched(false);
      return;
    }
    const query = matchMedia(`(orientation: ${desired})`);
    const update = () => setMismatched(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [desired]);

  return mismatched;
}
