import { describe, expect, it } from 'vitest';
import { paginateAssessments, parseAssessmentPageQuery } from './assessment-pagination.js';

describe('assessment pagination', () => {
  it('defaults to the newest forty rows', () => {
    const query = parseAssessmentPageQuery({});
    expect(query).toEqual({ offset: 0, limit: 40 });
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
    expect(query).toEqual({ offset: 40, limit: 200 });
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
  });
});
