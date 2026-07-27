import { describe, expect, it } from 'vitest';
import { bugReportUrl, ISSUES_URL, REPO_URL } from './github.js';

describe('github links', () => {
  it('points the issues list at the same repo', () => {
    expect(ISSUES_URL).toBe(`${REPO_URL}/issues`);
  });
});

describe('bugReportUrl', () => {
  it('targets the bug report template', () => {
    const url = new URL(bugReportUrl());
    expect(url.origin + url.pathname).toBe(`${REPO_URL}/issues/new`);
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
  });

  it('prefills the page and the visit id', () => {
    const url = new URL(bugReportUrl({ where: '/play/arena-tag', visitId: 'visit-123' }));
    expect(url.searchParams.get('where')).toBe('/play/arena-tag');
    // Matches the `report-id` field in .github/ISSUE_TEMPLATE/bug_report.yml.
    expect(url.searchParams.get('report-id')).toBe('visit-123');
  });

  it('omits fields it does not have rather than sending empty ones', () => {
    const url = new URL(bugReportUrl({ visitId: null }));
    expect(url.searchParams.has('where')).toBe(false);
    expect(url.searchParams.has('report-id')).toBe(false);
  });
});
