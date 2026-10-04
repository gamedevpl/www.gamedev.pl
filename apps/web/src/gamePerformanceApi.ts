import type { GamePerformanceQuery, GamePerformanceResponse } from '@gamedevpl/contract';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchGamePerformance(query: GamePerformanceQuery): Promise<GamePerformanceResponse> {
  const params = new URLSearchParams({
    slug: query.slug,
    days: String(query.days),
    performanceReviewers: query.performanceReviewers,
  });
  if (query.artifactVersion) params.set('artifactVersion', query.artifactVersion);
  const response = await fetch(`${API_BASE}/api/me/studio/performance?${params}`, { credentials: 'include' });
  if (!response.ok) {
    const error = new Error(String(response.status));
    throw error;
  }
  return response.json() as Promise<GamePerformanceResponse>;
}
