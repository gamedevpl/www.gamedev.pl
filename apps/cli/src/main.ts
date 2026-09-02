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
import { getStatus, previewUrl } from './turn.js';
import { checkoutGame, unreconciledMessage } from './checkout.js';
import { runLadder, assertLadderGreen } from './verify.js';
import { handleHelperLine } from './git-remote.js';

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
    const slug = (argv[2] ?? '').replace(/^gamedev:\/\//, '');
    io.stdout.write(`${handleHelperLine('capabilities', slug).join('\n')}\n`);
    return EXIT_GREEN;
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
      const status = await getStatus(api, token);
      if (asJson) io.stdout.write(`${JSON.stringify(status)}\n`);
      else {
        io.stdout.write(`${status.status}${status.stall ? ` (${status.stall})` : ''}\n`);
        if (status.preview?.slug) io.stdout.write(`${previewUrl(api.origin, status.preview.slug)}\n`);
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
    if (verb === 'diff') {
      if (flags.force) return EXIT_GREEN;
      throw new CliError(unreconciledMessage(), EXIT_REFUSED);
    }
    if (verb === 'submit') {
      assertLadderGreen(runLadder({ cwd: args[0] ?? process.cwd(), publish: flags.publish === true }));
      io.stdout.write('static ladder green\n');
      return EXIT_GREEN;
    }
    if (verb === 'connect') {
      io.stdout.write(`gamedev connect ${args[0] ?? ''}\n`);
      return EXIT_GREEN;
    }
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
