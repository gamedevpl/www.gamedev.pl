#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { parseArgv, jsonMode, SLASH_VERBS } from './argv.js';
import { createApi, requireTtyFlag } from './api.js';
import { encryptedFileStore, FILE_FALLBACK_WARNING, memoryStore, type TokenStore } from './keychain.js';
import { originFromEnv } from './oauth.js';
import { CliError, EXIT_GREEN, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { describeError, pipeNeedsFlag } from './errors.js';
import { handleReplLine, replBanner } from './repl.js';
import type { IntakeDraft } from './create.js';
import { getStatus, isTerminalStatus, previewUrl } from './turn.js';
import { checkoutGame, diffGame, pullGame, readCheckoutSlug, unreconciledMessage } from './checkout.js';
import { runLadder, assertLadderGreen } from './verify.js';
import { runGitRemoteHelper } from './git-remote-main.js';
import { dispatchReadVerb } from './verbs.js';

function storeFromEnv(env: NodeJS.ProcessEnv): TokenStore {
  if (env.GAMEDEV_TOKEN) {
    return memoryStore({ accessToken: env.GAMEDEV_TOKEN, tokenType: 'Bearer', scope: 'creator' });
  }
  if (env.GAMEDEV_ALLOW_FILE_KEYCHAIN === 'true' || env.GAMEDEV_TOKEN_FILE) {
    stderr.write(`${FILE_FALLBACK_WARNING}\n`);
  }
  return encryptedFileStore(env);
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
  if (/git-remote-gamedev/.test(argv[1] ?? argv[0] ?? '')) {
    return runGitRemoteHelper(argv, env);
  }
  const { verb, args, flags } = parseArgv(argv);
  const asJson = jsonMode(flags);
  const origin = originFromEnv(env);
  const store = storeFromEnv(env);
  const api = createApi({ origin, store, env });
  const tty = Boolean(io.stdin.isTTY);

  try {
    if (verb === 'help' || flags.help) {
      io.stdout.write(`gamedev <${SLASH_VERBS.join('|')}>\n`);
      return EXIT_GREEN;
    }
    if (verb === 'login') {
      if (env.GAMEDEV_TOKEN) {
        await store.set({ accessToken: env.GAMEDEV_TOKEN, tokenType: 'Bearer', scope: 'creator' });
        io.stdout.write('signed in with GAMEDEV_TOKEN\n');
        return EXIT_GREEN;
      }
      requireTtyFlag(tty, '--token', 'GAMEDEV_TOKEN=… gamedev login');
      io.stdout.write(`open ${origin}/oauth/authorize to sign in, then retry with GAMEDEV_TOKEN set\n`);
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
      if (!token) throw new CliError('gamedev status <token-or-slug>', EXIT_INPUT, '<token>');
      const max = typeof flags.watch === 'string' ? Number(flags.watch) || 30 : flags.watch ? 30 : 1;
      let delay = 2000;
      let status = await getStatus(api, token);
      for (let i = 1; i <= max; i += 1) {
        if (asJson) io.stdout.write(`${JSON.stringify(status)}\n`);
        else {
          io.stdout.write(`${status.status}${status.stall ? ` (${status.stall})` : ''}\n`);
          if (status.preview?.slug) io.stdout.write(`${previewUrl(api.origin, status.preview.slug)}\n`);
        }
        if (!flags.watch || i === max || isTerminalStatus(status.status)) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(Math.round(delay * 1.5), 15_000);
        status = await getStatus(api, token);
      }
      return EXIT_GREEN;
    }
    if (verb === 'checkout') {
      const slug = args[0];
      if (!slug) throw new CliError('gamedev checkout <slug>', EXIT_INPUT, '<slug>');
      const dest = args[1] ?? slug;
      const result = await checkoutGame({ api, slug, dest });
      io.stdout.write(`checked out ${slug} → ${result.dest} (origin ${result.remote})\n`);
      return EXIT_GREEN;
    }
    if (verb === 'pull') {
      const slug = args[0] ?? readCheckoutSlug(process.cwd());
      if (!slug) throw new CliError('gamedev pull <slug>', EXIT_INPUT, '<slug>');
      const dest = args[1] ?? process.cwd();
      const pulled = await pullGame({ api, slug, dest });
      io.stdout.write(asJson ? `${JSON.stringify(pulled)}\n` : `pulled ${slug} @ ${pulled.version}\n`);
      return EXIT_GREEN;
    }
    if (verb === 'diff') {
      if (flags.force) return EXIT_GREEN;
      const slug = args[0] ?? readCheckoutSlug(process.cwd());
      if (!slug) throw new CliError('gamedev diff <slug>', EXIT_INPUT, '<slug>');
      const dest = args[1] ?? process.cwd();
      const diff = await diffGame({ api, slug, dest });
      if (asJson) io.stdout.write(`${JSON.stringify(diff)}\n`);
      if (diff.unreconciled) throw new CliError(unreconciledMessage(), EXIT_REFUSED, '--force');
      return EXIT_GREEN;
    }
    if (verb === 'submit') {
      const dest = args[0] ?? process.cwd();
      const slug = (typeof flags.slug === 'string' ? flags.slug : null) ?? readCheckoutSlug(dest);
      if (!flags.force && slug) {
        const diff = await diffGame({ api, slug, dest });
        if (diff.unreconciled) throw new CliError(unreconciledMessage(), EXIT_REFUSED, '--force');
      }
      assertLadderGreen(runLadder({ cwd: dest, publish: flags.publish === true }));
      io.stdout.write('static ladder green\n');
      return EXIT_GREEN;
    }
    if (verb === 'connect') {
      io.stdout.write(`gamedev connect ${args[0] ?? ''}\n`);
      return EXIT_GREEN;
    }
    const read = await dispatchReadVerb({ verb, args, flags, api, io });
    if (read !== null) return read;
    if (verb === 'repl') {
      if (!tty) throw pipeNeedsFlag('a verb such as gamedev whoami');
      io.stdout.write(`${replBanner(true, env)}\n`);
      const rl = createInterface({ input: io.stdin, output: io.stdout });
      let token = typeof flags.token === 'string' ? flags.token : null;
      let draft: IntakeDraft | null = null;
      for (;;) {
        const line = await rl.question('› ');
        const result = await handleReplLine({
          line,
          api,
          token,
          draft,
          write: (s) => io.stdout.write(`${s}\n`),
        });
        if (result.token !== undefined) token = result.token;
        if (result.draft !== undefined) draft = result.draft;
        if (result.next === 'quit') break;
      }
      rl.close();
      return EXIT_GREEN;
    }
    io.stderr.write(`unknown verb ${verb} — gamedev help\n`);
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
