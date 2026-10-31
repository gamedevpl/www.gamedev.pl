import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import {
  logModerationRejection,
  MODERATION_BILLING_EXHAUSTED_MSG,
  MODERATION_FAILED_CLOSED_PREFIX,
  MODERATION_UNAVAILABLE_MSG,
} from './moderation-metrics.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('the outage alert', () => {
  const script = readFileSync(resolve(here, '../../../../infra/setup-monitoring.sh'), 'utf8');

  it('pages on an outage separately from a rejection burst', () => {
    expect(script).toContain(MODERATION_UNAVAILABLE_MSG);
    expect(script).toContain(MODERATION_BILLING_EXHAUSTED_MSG);
    expect(script).toContain(MODERATION_FAILED_CLOSED_PREFIX);
    expect(script).toContain('moderation_unavailable');
    const policy = script.slice(script.indexOf('A35 moderation unavailable'));
    expect(policy.slice(0, 1400)).toContain('logging.googleapis.com/user/moderation_unavailable');
    expect(policy.slice(0, 1400)).toContain('service_name');
    expect(policy.slice(0, 1400)).toContain('"alignmentPeriod": "600s"');
    expect(policy.slice(0, 1400)).toContain('"thresholdValue": 2');
    expect(policy.slice(0, 1600)).toContain('"${CHANNEL_NAME}"');
  });
});

describe('a broken moderation logger', () => {
  it('logs through a real pino logger without throwing', () => {
    const lines: string[] = [];
    const log = pino(
      { level: 'warn' },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      }),
    );

    // The production failure: copying the method off the logger drops `this`.
    const detached = { warn: log.warn };
    expect(() => detached.warn({ moderation: { surface: 'delivery' } }, 'detached')).toThrow(TypeError);

    expect(() =>
      logModerationRejection(log, { surface: 'delivery', uid: 'g:1', category: 'other', unavailable: true }),
    ).not.toThrow();
    expect(lines.join('')).toContain(MODERATION_UNAVAILABLE_MSG);
  });

  it('swallows a broken logger so the refusal can still be returned', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    try {
      expect(() =>
        logModerationRejection(
          {
            warn: () => {
              throw new TypeError('this[writeSym] is not a function');
            },
          },
          { surface: 'delivery', uid: 'g:1', unavailable: true },
        ),
      ).not.toThrow();
    } finally {
      console.error = original;
    }
    expect(errors.join('\n')).toContain('moderation metric log failed');
  });
});

describe('pino methods stay on their logger', () => {
  const apiSrc = resolve(here, '..');
  const files = readdirSync(apiSrc, { recursive: true })
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.split(sep).join('/'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));

  // Copied pino methods throw unless they stay bound.
  const DETACHED =
    /(?:^|[^.\w])((?:[\w$.]+\.)?(?:log|logger))\.(info|warn|error|debug|fatal|trace)\b(?!\s*(?:\(|\.bind|\.call|\?\.|\s*!==|\s*===|\s*!=|\s*==))/;

  it('finds no detached logger method in apps/api', () => {
    const hits: string[] = [];
    for (const name of files) {
      const lines = readFileSync(join(apiSrc, name), 'utf8').split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        const code = line.slice(0, line.indexOf('//') === -1 ? line.length : line.indexOf('//'));
        if (DETACHED.test(code)) hits.push(`${name}:${index + 1}: ${trimmed}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
