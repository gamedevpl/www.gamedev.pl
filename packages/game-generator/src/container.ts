import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GameGenerator, GameProject } from './types.js';

const execFileAsync = promisify(execFile);

/** Runs docker and returns stdout. Injected in tests so no test shells out. */
export type DockerRunner = (args: string[]) => Promise<string>;

export interface ContainerGeneratorOptions {
  /** Image to run. Default: env AGENT_RUNNER_IMAGE or 'gamedevpl/agent-runner:latest'. */
  image?: string;
  /** AGENT_MODE handed to the runner. Default: env AGENT_MODE or 'mock'. */
  mode?: string;
  /** docker executable. Default: env DOCKER_PATH or 'docker'. */
  dockerPath?: string;
  /**
   * docker --network value. Defaults to 'none' for mock mode (it needs no network,
   * so denying it is free safety) and to 'bridge' for external mode, which has to
   * reach the model API. Override to lock a real agent down further.
   */
  network?: string;
  /**
   * Names of host env vars to forward into the container. Only NAMES are passed to
   * docker (`-e NAME`), never `NAME=value`, so secrets stay out of the argv/process
   * list. Defaults to the agent config vars plus the common API-key vars.
   */
  passEnv?: string[];
  /** Override the docker invocation entirely (used by tests to avoid docker). */
  runDocker?: DockerRunner;
}

/**
 * Forwarded by name when present in the host env. `AGENT_CMD`/`AGENT_ARGS` select
 * and configure the real agent CLI; the key vars authenticate it. Nothing here is
 * required for mock mode.
 */
const DEFAULT_PASS_ENV = [
  'AGENT_CMD',
  'AGENT_ARGS',
  'AGENT_TIMEOUT_MS',
  'AGENT_PROMPT_ENV',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

function fieldsPresent(value: Record<string, unknown>): boolean {
  return (
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.html === 'string' &&
    typeof value.js === 'string' &&
    typeof value.css === 'string'
  );
}

/**
 * Parses and validates the agent-runner's stdout into a GameProject. Pure and
 * docker-free so it can be unit-tested directly. The runner emits a single clean
 * JSON object on stdout (logs go to its stderr); we still trim in case a trailing
 * newline is present. Throws a clear error on anything that isn't a valid project.
 */
export function parseGameProject(raw: string): GameProject {
  const text = raw.trim();
  if (!text) {
    throw new Error('agent-runner produced no output');
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('agent-runner output was not valid JSON');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('agent-runner output was not a GameProject object');
  }

  const obj = data as Record<string, unknown>;
  if (!fieldsPresent(obj)) {
    throw new Error('agent-runner output is missing required GameProject string fields');
  }

  // The generator is an untrusted seam; enforce the same basic hygiene the API
  // does downstream so an empty project fails here with a clear message.
  if (!(obj.html as string).trim() || !(obj.js as string).trim()) {
    throw new Error('agent-runner GameProject has empty html or js');
  }

  return {
    title: obj.title as string,
    description: obj.description as string,
    html: obj.html as string,
    js: obj.js as string,
    css: obj.css as string,
  };
}

async function defaultRunDocker(dockerPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(dockerPath, args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/**
 * A GameGenerator that runs the agent-runner container image and parses the
 * GameProject it emits on stdout. Defaults to the offline mock mode, so the whole
 * container pipeline runs with zero tokens. The image/mode are env-configurable;
 * which agent runs inside is a runtime concern, never hardcoded here (see
 * docs/risks-and-open-questions.md B1/B2).
 */
export class ContainerGameGenerator implements GameGenerator {
  readonly name = 'container';
  private readonly image: string;
  private readonly mode: string;
  private readonly dockerPath: string;
  private readonly network: string;
  private readonly passEnv: string[];
  private readonly runDocker: DockerRunner;

  constructor(options: ContainerGeneratorOptions = {}) {
    this.image = options.image ?? process.env.AGENT_RUNNER_IMAGE ?? 'gamedevpl/agent-runner:latest';
    this.mode = options.mode ?? process.env.AGENT_MODE ?? 'mock';
    this.dockerPath = options.dockerPath ?? process.env.DOCKER_PATH ?? 'docker';
    // Mock generates entirely offline, so it gets no network at all. A real agent
    // has to reach its model API, so external can't be locked down the same way.
    this.network = options.network ?? (this.mode === 'mock' ? 'none' : 'bridge');
    this.passEnv = options.passEnv ?? DEFAULT_PASS_ENV;
    this.runDocker = options.runDocker ?? ((args) => defaultRunDocker(this.dockerPath, args));
  }

  /** Builds the `docker run` argv. Split out so tests can assert on it directly. */
  buildDockerArgs(prompt: string): string[] {
    const args = ['run', '--rm', '--network', this.network];

    // Values are inlined here only for non-secret config. AGENT_MODE is a fixed
    // keyword and PROMPT is user text — neither is a credential.
    args.push('-e', `AGENT_MODE=${this.mode}`, '-e', `PROMPT=${prompt}`);

    // Secrets and agent config are forwarded BY NAME (`-e NAME`), so docker reads
    // the value from our environment and it never appears in argv — which would
    // otherwise leak it to the process list and to any command logging.
    for (const name of this.passEnv) {
      if (process.env[name]) args.push('-e', name);
    }

    args.push(this.image);
    return args;
  }

  async generate(prompt: string): Promise<GameProject> {
    // Args are passed as an array (no shell), so the prompt can't inject.
    const args = this.buildDockerArgs(prompt);

    let stdout: string;
    try {
      stdout = await this.runDocker(args);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const hint =
        this.mode === 'mock'
          ? 'Is docker installed and the image built?'
          : `External mode runs a real agent: check AGENT_CMD is set and installed in the image, ` +
            `that its credentials were forwarded (see passEnv), and that network "${this.network}" ` +
            `lets it reach its API.`;
      throw new Error(
        `container agent-runner failed (image "${this.image}", mode "${this.mode}"). ${hint} ` +
          `Underlying error: ${detail}`,
      );
    }

    return parseGameProject(stdout);
  }
}
