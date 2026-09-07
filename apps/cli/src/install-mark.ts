import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CLI_INSTALL_CHANNELS, CLI_PLATFORM_OS, type CliInstallChannel, type CliPlatformOs } from '@gamedevpl/contract';
import { CLI_VERSION } from './update.js';

// A local flag, never sent: which install already reported its rung.
type InstallMark = { reported?: string; channel?: CliInstallChannel };

export function installMarkPath(env: NodeJS.ProcessEnv): string {
  return join(env.HOME ?? homedir(), '.config', 'gamedevpl', 'install.json');
}

function readMark(env: NodeJS.ProcessEnv): InstallMark {
  try {
    const parsed: unknown = JSON.parse(readFileSync(installMarkPath(env), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    const row = parsed as Record<string, unknown>;
    // A hand-edited file must not reach the wire.
    const channel = (CLI_INSTALL_CHANNELS as readonly unknown[]).includes(row.channel)
      ? (row.channel as CliInstallChannel)
      : undefined;
    return {
      ...(typeof row.reported === 'string' ? { reported: row.reported } : {}),
      ...(channel ? { channel } : {}),
    };
  } catch {
    return {};
  }
}

function writeMark(env: NodeJS.ProcessEnv, mark: InstallMark): boolean {
  try {
    const path = installMarkPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(mark)}\n`);
    return true;
  } catch {
    // A read-only home costs a funnel row, never the command.
    return false;
  }
}

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
  // An install we cannot mark would report again on every single run.
  if (!writeMark(input.env, { reported: version })) return null;
  const os = platformOs(input.platform ?? process.platform);
  return { ...(mark.channel ? { channel: mark.channel } : {}), ...(os ? { os } : {}) };
}
