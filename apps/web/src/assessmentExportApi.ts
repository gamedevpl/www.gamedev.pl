import { readJson, type GameAssessment } from './reviewApi.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface AdminAssessmentTotals {
  slug: string;
  title: string;
  keep: number;
  cut: number;
  skip: number;
  notes: number;
  // Verdicts already acted on, and those still open.
  resolved: number;
  open: number;
}

export interface AdminAssessmentsExport {
  total: number;
  games: AdminAssessmentTotals[];
  recent: GameAssessment[];
  resolved: number;
  open: number;
}

interface AdminAssessmentsPage extends AdminAssessmentsExport {
  offset: number;
  limit: number;
  nextOffset: number | null;
}

async function fetchAdminAssessments(offset: number): Promise<AdminAssessmentsPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: '200' });
  const res = await fetch(`${API_BASE}/api/admin/assessments?${params.toString()}`, { credentials: 'include' });
  return readJson(res);
}

export async function fetchAllAdminAssessments(): Promise<AdminAssessmentsExport> {
  const first = await fetchAdminAssessments(0);
  const recent = [...first.recent];
  let nextOffset = first.nextOffset;
  while (nextOffset !== null) {
    const page = await fetchAdminAssessments(nextOffset);
    if (page.offset !== nextOffset) throw new Error('assessment pagination mismatch');
    recent.push(...page.recent);
    nextOffset = page.nextOffset;
  }
  return { total: first.total, games: first.games, recent, resolved: first.resolved, open: first.open };
}
