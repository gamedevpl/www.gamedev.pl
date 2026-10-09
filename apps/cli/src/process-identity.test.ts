import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { processStartIdentity } from './process-identity.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', descriptor);
  vi.resetAllMocks();
  vi.useRealTimers();
});
const platform = (value: string) => Object.defineProperty(process, 'platform', { ...descriptor, value });

it('reads Linux boot and process start identities despite parentheses in command names', () => {
  platform('linux');
  const fields = ['S', ...Array.from({ length: 18 }, () => '0'), '1234', '0'];
  vi.mocked(readFileSync).mockImplementation((path) =>
    String(path).endsWith('/stat') ? `42001 (a b) c) ${fields.join(' ')}` : 'boot-one\n',
  );
  expect(processStartIdentity(42001)).toBe('boot-one:1234');
});

it('uses UTC process start and boot identity on macOS', () => {
  platform('darwin');
  vi.mocked(execFileSync).mockImplementation((command) =>
    command === '/bin/ps' ? ' Fri Oct  9 22:00:00 2026\n' : '{ sec = 123, usec = 456 }\n',
  );
  expect(processStartIdentity(42002)).toBe('{ sec = 123, usec = 456 }:Fri Oct  9 22:00:00 2026');
  expect(execFileSync).toHaveBeenCalledWith(
    '/bin/ps',
    ['-p', '42002', '-o', 'lstart='],
    expect.objectContaining({ env: expect.objectContaining({ LC_ALL: 'C', TZ: 'UTC' }) }),
  );
});

it('uses native process-start ticks on Windows without loading a profile', () => {
  platform('win32');
  vi.mocked(execFileSync).mockReturnValue(' 639000123456789000\r\n');
  expect(processStartIdentity(42003)).toBe('639000123456789000');
  expect(execFileSync).toHaveBeenCalledWith(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-Process -Id 42003 -ErrorAction Stop).StartTime.ToUniversalTime().Ticks',
    ],
    expect.objectContaining({ timeout: 5000 }),
  );
});

it('rechecks an unverifiable owner rather than caching failure forever', () => {
  platform('darwin');
  vi.useFakeTimers();
  vi.mocked(execFileSync).mockImplementation(() => {
    throw new Error('temporarily unavailable');
  });
  expect(processStartIdentity(process.pid)).toBeNull();
  vi.advanceTimersByTime(1001);
  vi.mocked(execFileSync).mockReturnValue('valid-start');
  expect(processStartIdentity(process.pid)).toBe('valid-start:valid-start');
});
