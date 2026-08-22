import { describe, expect, it } from 'vitest';
import { paginateAssessments, parseAssessmentPageQuery } from './assessment-pagination.js';

describe('assessment pagination', () => {
  it('defaults to the newest forty rows', () => {
    const query = parseAssessmentPageQuery({});
    expect(query).toEqual({ offset: 0, limit: 40, resolution: 'all' });
    expect(
      paginateAssessments(
        Array.from({ length: 50 }, (_, index) => index),
        query!,
      ),
    ).toEqual({
      recent: Array.from({ length: 40 }, (_, index) => index),
      offset: 0,
      limit: 40,
      nextOffset: 40,
    });
  });

  it('accepts bounded later pages', () => {
    const query = parseAssessmentPageQuery({ offset: '40', limit: '200' });
    expect(query).toEqual({ offset: 40, limit: 200, resolution: 'all' });
    expect(
      paginateAssessments(
        Array.from({ length: 210 }, (_, index) => index),
        query!,
      ).nextOffset,
    ).toBeNull();
  });

  it('rejects invalid page bounds', () => {
    expect(parseAssessmentPageQuery({ offset: '-1' })).toBeNull();
    expect(parseAssessmentPageQuery({ limit: '201' })).toBeNull();
    expect(parseAssessmentPageQuery({ resolution: 'sometimes' })).toBeNull();
  });

  it('carries the resolution filter for the operator worklist', () => {
    expect(parseAssessmentPageQuery({ resolution: 'open' })).toEqual({ offset: 0, limit: 40, resolution: 'open' });
  });
});
