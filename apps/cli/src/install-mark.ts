import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CLI_PLATFORM_OS, type CliInstallChannel, type CliPlatformOs } from '@gamedevpl/contract';
import { CLI_VERSION } from './update.js';

// A local flag, never sent: which install already reported its rung.
type InstallMark = { reported?: string; channel?: CliInstallChannel };

export function installMarkPath(env: NodeJS.ProcessEnv): string {
  return join(env.HOME ?? homedir(), '.config', 'gamedevpl', 'install.json');
}

function readMark(env: NodeJS.ProcessEnv): InstallMark {
  try {
    const parsed: unknown = JSON.parse(readFileSync(installMarkPath(env), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as InstallMark) : {};
  } catch {
    return {};
  }
}

function writeMark(env: NodeJS.ProcessEnv, mark: InstallMark): void {
  try {
    const path = installMarkPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(mark)}\n`);
  } catch {
    // A read-only home costs a funnel row, never the command.
  }
}

// Only `update` knows how a binary arrived; the next run reports it.
export function noteInstallChannel(env: NodeJS.ProcessEnv, channel: CliInstallChannel): void {
  writeMark(env, { ...readMark(env), channel });
}

export function platformOs(platform: string): CliPlatformOs | undefined {
  return (CLI_PLATFORM_OS as readonly string[]).includes(platform) ? (platform as CliPlatformOs) : undefined;
}

// One report per install; CI has a fresh HOME every job.
export function takeInstallReport(input: {
  env: NodeJS.ProcessEnv;
  isTty: boolean;
  version?: string;
  platform?: string;
}): { channel?: CliInstallChannel; os?: CliPlatformOs } | null {
  const version = input.version ?? CLI_VERSION;
  const mark = readMark(input.env);
  if (mark.reported === version || !input.isTty) return null;
  writeMark(input.env, { reported: version });
  const os = platformOs(input.platform ?? process.platform);
  return { ...(mark.channel ? { channel: mark.channel } : {}), ...(os ? { os } : {}) };
}
