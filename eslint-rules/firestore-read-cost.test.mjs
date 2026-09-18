import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  baselineReadsFor,
  compareRouteReads,
  filterMeasuredRoutes,
  nextRouteBaseline,
} from './firestore-read-cost-lib.mjs';

const CHECKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'firestore-read-cost-check.mjs');

describe('baselineReadsFor', () => {
  it('missing route is zero — new routes may not ship unread cost', () => {
    expect(baselineReadsFor({ version: 1, routes: { 'GET /api/notifications': 4 } }, 'GET /new')).toBe(0);
  });
});

describe('filterMeasuredRoutes', () => {
  const measured = {
    'GET /api/notifications': 4,
    'GET /api/submissions/mine': 20,
    'GET /api/review/status': 9,
  };

  it('unscoped lists every measured route', () => {
    expect(filterMeasuredRoutes(measured, [])).toEqual([
      'GET /api/notifications',
      'GET /api/review/status',
      'GET /api/submissions/mine',
    ]);
  });

  it('a substring scopes to matching routes', () => {
    expect(filterMeasuredRoutes(measured, ['submissions/mine'])).toEqual(['GET /api/submissions/mine']);
  });
});

describe('compareRouteReads', () => {
  it('allows a shrink and flags a raise', () => {
    const baseline = { version: 1, routes: { 'GET /api/notifications': 6, 'GET /api/submissions/mine': 20 } };
    const failures = compareRouteReads(baseline, { 'GET /api/notifications': 4, 'GET /api/submissions/mine': 21 }, [
      'GET /api/notifications',
      'GET /api/submissions/mine',
    ]);
    expect(failures).toEqual([{ route: 'GET /api/submissions/mine', reads: 21, allowed: 20, isNew: false }]);
  });
});

describe('nextRouteBaseline', () => {
  it('refuses a raise without --force', () => {
    const baseline = { version: 1, routes: { 'GET /api/notifications': 4 } };
    const result = nextRouteBaseline(
      baseline,
      { 'GET /api/notifications': 5 },
      { force: false, reseal: false, filters: ['GET /api/notifications'] },
    );
    expect(result.refused).toEqual(['GET /api/notifications']);
    expect(result.payload.routes['GET /api/notifications']).toBe(4);
  });

  it('raises one route with --force and records the delta', () => {
    const baseline = { version: 1, routes: { 'GET /api/notifications': 4, 'GET /api/submissions/mine': 20 } };
    const result = nextRouteBaseline(
      baseline,
      { 'GET /api/notifications': 5 },
      { force: true, reseal: false, filters: ['GET /api/notifications'] },
    );
    expect(result.refused).toEqual([]);
    expect(result.payload.routes).toEqual({ 'GET /api/notifications': 5, 'GET /api/submissions/mine': 20 });
    expect(result.changed).toEqual([{ route: 'GET /api/notifications', from: 4, to: 5 }]);
  });

  it('shrinks freely without --force', () => {
    const baseline = { version: 1, routes: { 'GET /api/notifications': 6 } };
    const result = nextRouteBaseline(
      baseline,
      { 'GET /api/notifications': 4 },
      { force: false, reseal: false, filters: ['GET /api/notifications'] },
    );
    expect(result.refused).toEqual([]);
    expect(result.payload.routes['GET /api/notifications']).toBe(4);
  });
});

describe('firestore-read-cost-check', () => {
  it('refuses an unscoped --write before measuring', () => {
    const result = spawnSync(process.execPath, [CHECKER, '--write'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/Refusing an unscoped --write/);
  });

  it('over-baseline hint raises one route, not an unscoped --write', () => {
    const source = fs.readFileSync(CHECKER, 'utf8');
    expect(source).toMatch(/npm run firestore-read-cost -- \$\{JSON\.stringify\(failure\.route\)\} --write --force/);
    expect(source).not.toMatch(/firestore-read-cost -- --write`/);
  });
});
