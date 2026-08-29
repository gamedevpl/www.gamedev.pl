import { getSavedSpecs } from '../../mySpecs.js';
import { listMySubmissions } from '../../submissionApi.js';

const ONBOARDED_KEY = 'gamedev_studio_onboarded';

export function isStudioOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markStudioOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Convenience only.
  }
}

// Resolve status token from slug or token.
export async function resolveWelcomeToken(game: string): Promise<{ token: string; title: string }> {
  const local = getSavedSpecs().find((spec) => spec.token === game || spec.slug === game);
  if (local) {
    return { token: local.token, title: local.title };
  }
  try {
    const mine = await listMySubmissions();
    const match = mine.find((row) => row.token === game || row.slug === game);
    if (match) {
      return { token: match.token, title: match.title };
    }
  } catch {
    // Token addresses still work without the shelf.
  }
  return { token: game, title: game };
}
