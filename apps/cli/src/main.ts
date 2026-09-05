#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stdin, stdout, stderr } from 'node:process';
import { parseArgv, jsonMode, SLASH_VERBS } from './argv.js';
import { GIT_REMOTE_HELPER, GIT_REMOTE_SCHEME, cliUsage } from './bin-name.js';
import { createApi, requireTtyFlag } from './api.js';
import {
  encryptedFileStore,
  FILE_FALLBACK_WARNING,
  fileKeychainOptedIn,
  memoryStore,
  type TokenStore,
} from './keychain.js';
import { runLoopbackLogin } from './login.js';
import { originFromEnv } from './oauth.js';
import { CliError, EXIT_GREEN, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { describeError, pipeNeedsFlag } from './errors.js';
import { checkoutGame, diffGame, formatSyncLines, pullGame, readCheckoutSlug } from './checkout.js';
import { connectGame } from './connect.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { runGitRemoteHelper } from './git-remote-main.js';
import { runStatusVerb } from './status-watch.js';
import { dispatchReadVerb } from './verbs.js';
import { formatHelp } from './help.js';

function storeFromEnv(env: NodeJS.ProcessEnv, warn: (line: string) => void): TokenStore {
  const token = env.GAMEDEV_TOKEN?.trim();
  if (token) {
    return memoryStore({ accessToken: token, tokenType: 'Bearer', scope: 'creator' });
  }
  if (fileKeychainOptedIn(env)) {
    warn(`${FILE_FALLBACK_WARNING}\n`);
  }
  return encryptedFileStore(env);
}

export function isGitRemoteHelper(argv: string[]): boolean {
  if ((argv[1] ?? argv[0] ?? '').includes(GIT_REMOTE_HELPER)) return true;
  if (!argv.some((arg) => arg.startsWith(`${GIT_REMOTE_SCHEME}://`))) return false;
  const first = argv[2];
  if (first && !first.startsWith('-') && (SLASH_VERBS as readonly string[]).includes(first)) return false;
  return true;
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream } = {
    stdin,
    stdout,
    stderr,
  },
): Promise<number> {
  if (isGitRemoteHelper(argv)) {
    return runGitRemoteHelper(argv, env);
  }
  const { verb, args, flags } = parseArgv(argv);
  const asJson = jsonMode(flags);
  const origin = originFromEnv(env);
  const store = storeFromEnv(env, (line) => io.stderr.write(line));
  const api = createApi({ origin, store, env });
  const tty = Boolean(io.stdin.isTTY);

  try {
    if (verb === 'help' || flags.help || flags.h) {
      io.stdout.write(`${formatHelp()}\n`);
      return EXIT_GREEN;
    }
    if (verb === 'login') {
      const persist = encryptedFileStore(env);
      const fromFlag = typeof flags.token === 'string' ? flags.token.trim() : '';
      const fromEnv = env.GAMEDEV_TOKEN?.trim() ?? '';
      const imported = fromFlag || fromEnv;
      if (imported) {
        await persist.set({ accessToken: imported, tokenType: 'Bearer', scope: 'creator' });
        if (fileKeychainOptedIn(env) && fromEnv) {
          io.stderr.write(`${FILE_FALLBACK_WARNING}\n`);
        }
        io.stdout.write(fromFlag ? 'signed in with --token\n' : 'signed in with GAMEDEV_TOKEN\n');
        return EXIT_GREEN;
      }
      requireTtyFlag(tty, '--token', `GAMEDEV_TOKEN=… ${cliUsage('login')}`);
      await runLoopbackLogin({
        origin,
        store: persist,
        stdout: io.stdout,
        stderr: io.stderr,
        env,
        isTty: Boolean(io.stdout.isTTY),
      });
      return EXIT_GREEN;
    }
    if (verb === 'logout') {
      await store.clear();
      io.stdout.write('signed out\n');
      return EXIT_GREEN;
    }
    if (verb === 'whoami') {
      const profile = await api.request<{ handle?: string; uid?: string }>('GET', '/api/me/profile');
      io.stdout.write(asJson ? `${JSON.stringify(profile)}\n` : `${profile.handle ?? profile.uid ?? 'signed in'}\n`);
      return EXIT_GREEN;
    }
    if (verb === 'status') {
      const token = args[0];
      if (!token) throw new CliError(cliUsage('status', '<token-or-slug>'), EXIT_INPUT, '<token>');
      const max = typeof flags.watch === 'string' ? Number(flags.watch) || 30 : flags.watch ? 30 : 1;
      return runStatusVerb({
        api,
        token,
        maxPolls: max,
        asJson,
        live: Boolean(io.stdout.isTTY) && Boolean(flags.watch) && !asJson,
        stdout: io.stdout,
      });
    }
    if (verb === 'checkout') {
      const slug = args[0];
      if (!slug) throw new CliError(cliUsage('checkout', '<slug>'), EXIT_INPUT, '<slug>');
      const dest = args[1] ?? slug;
      const result = await checkoutGame({ api, slug, dest });
      io.stdout.write(`checked out ${slug} → ${result.dest} (origin ${result.remote})\n`);
      return EXIT_GREEN;
    }
    if (verb === 'pull') {
      const slug = args[0] ?? readCheckoutSlug(process.cwd());
      if (!slug) throw new CliError(cliUsage('pull', '<slug>'), EXIT_INPUT, '<slug>');
      const dest = args[1] ?? process.cwd();
      const pulled = await pullGame({ api, slug, dest, force: flags.force === true });
      if (asJson) io.stdout.write(`${JSON.stringify(pulled)}\n`);
      else {
        const extra = pulled.kept.length ? `; kept local ${pulled.kept.join(', ')}` : '';
        io.stdout.write(`pulled ${slug} @ ${pulled.version} (${pulled.sync.kind.replaceAll('_', ' ')})${extra}\n`);
      }
      return EXIT_GREEN;
    }
    if (verb === 'diff') {
      const slug = args[0] ?? readCheckoutSlug(process.cwd());
      if (!slug) throw new CliError(cliUsage('diff', '<slug>'), EXIT_INPUT, '<slug>');
      const dest = args[1] ?? process.cwd();
      const diff = await diffGame({ api, slug, dest });
      if (asJson) io.stdout.write(`${JSON.stringify(diff)}\n`);
      else io.stdout.write(`${formatSyncLines(diff).join('\n')}\n`);
      if (!flags.force && (diff.kind === 'conflict' || diff.kind === 'legacy')) {
        throw new CliError(formatSyncLines(diff)[0] ?? diff.kind, EXIT_REFUSED, cliUsage('pull'));
      }
      return EXIT_GREEN;
    }
    if (verb === 'submit') {
      const dest = args[0] ?? process.cwd();
      const slug = (typeof flags.slug === 'string' ? flags.slug : null) ?? readCheckoutSlug(dest);
      if (!slug) throw new CliError(cliUsage('submit', '[dir]'), EXIT_INPUT, '--slug');
      const result = await submitGame({
        api,
        slug,
        dest,
        force: flags.force === true,
        publish: flags.publish === true,
      });
      if (asJson) io.stdout.write(`${JSON.stringify(result)}\n`);
      else io.stdout.write(`${formatSubmitLines(result, slug).join('\n')}\n`);
      return EXIT_GREEN;
    }
    if (verb === 'connect') {
      const slug = args[0] ?? readCheckoutSlug(process.cwd());
      if (!slug) throw new CliError(cliUsage('connect', '<slug>'), EXIT_INPUT, '<slug>');
      const dest = args[1] ?? process.cwd();
      await connectGame({
        api,
        slug,
        dest,
        env,
        agent: typeof flags.agent === 'string' ? flags.agent : undefined,
        handoff: flags.handoff === true,
        write: (line) => io.stdout.write(`${line}\n`),
      });
      return EXIT_GREEN;
    }
    const read = await dispatchReadVerb({ verb, args, flags, api, io });
    if (read !== null) return read;
    if (verb === 'repl') {
      if (!tty || !io.stdout.isTTY) throw pipeNeedsFlag(`a verb such as ${cliUsage('whoami')}`);
      const { runInkRepl } = await import('./tui/host.js');
      return runInkRepl({
        api,
        env,
        io,
        token: typeof flags.token === 'string' ? flags.token : null,
      });
    }
    io.stderr.write(`unknown verb ${verb} — ${cliUsage('help')}\n`);
    return EXIT_INPUT;
  } catch (error) {
    const shown = describeError(error);
    io.stderr.write(`${shown.message}${shown.next ? `\nnext: ${shown.next}` : ''}\n`);
    return shown.code;
  }
}

export function isLaunchedEntry(entry: string | undefined, moduleUrl: string = import.meta.url): boolean {
  if (!entry) return false;
  try {
    return moduleUrl === pathToFileURL(resolvePath(entry)).href;
  } catch {
    return false;
  }
}

if (isLaunchedEntry(process.argv[1])) {
  void runCli(process.argv, process.env).then((code) => process.exit(code));
}
