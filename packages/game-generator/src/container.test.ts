import { describe, expect, it } from 'vitest';
import { mintJobToken, verifyJobToken } from '@gamedevpl/job-auth';
import { ContainerGameGenerator, parseGameProject } from './container.js';

const sampleRunnerOutput = JSON.stringify({
  title: 'Hazard Dodge',
  description: 'Generated from your idea: "dodge blocks"',
  html: '<canvas id="game"></canvas>',
  js: 'requestAnimationFrame(() => {});',
  css: 'body { margin: 0; }',
});

describe('parseGameProject', () => {
  it('parses a valid runner GameProject JSON', () => {
    const project = parseGameProject(sampleRunnerOutput);
    expect(project).toEqual({
      title: 'Hazard Dodge',
      description: 'Generated from your idea: "dodge blocks"',
      html: '<canvas id="game"></canvas>',
      js: 'requestAnimationFrame(() => {});',
      css: 'body { margin: 0; }',
    });
  });

  it('tolerates a trailing newline on stdout', () => {
    const project = parseGameProject(sampleRunnerOutput + '\n');
    expect(project.title).toBe('Hazard Dodge');
  });

  it('throws on empty output', () => {
    expect(() => parseGameProject('   ')).toThrow(/no output/);
  });

  it('throws on non-JSON output', () => {
    expect(() => parseGameProject('not json at all')).toThrow(/not valid JSON/);
  });

  it('throws when output is a JSON array, not an object', () => {
    expect(() => parseGameProject('[1,2,3]')).toThrow(/not a GameProject object/);
  });

  it('throws when a required field is missing', () => {
    const missing = JSON.stringify({ title: 't', description: 'd', html: '<a>', js: 'x' });
    expect(() => parseGameProject(missing)).toThrow(/missing required GameProject/);
  });

  it('throws when a required field has the wrong type', () => {
    const wrong = JSON.stringify({ title: 1, description: 'd', html: '<a>', js: 'x', css: '' });
    expect(() => parseGameProject(wrong)).toThrow(/missing required GameProject/);
  });

  it('throws when html or js is empty', () => {
    const empty = JSON.stringify({ title: 't', description: 'd', html: '   ', js: 'x', css: '' });
    expect(() => parseGameProject(empty)).toThrow(/empty html or js/);
  });
});

describe('ContainerGameGenerator', () => {
  it('runs docker (injected) in mock mode and returns the parsed project', async () => {
    let receivedArgs: string[] = [];
    const generator = new ContainerGameGenerator({
      image: 'test-image',
      runDocker: async (args) => {
        receivedArgs = args;
        return sampleRunnerOutput;
      },
    });

    const project = await generator.generate('dodge blocks');
    expect(generator.name).toBe('container');
    expect(project.title).toBe('Hazard Dodge');
    // Defaults to mock mode, passes the prompt as an env arg (no shell), targets the image.
    expect(receivedArgs).toContain('AGENT_MODE=mock');
    expect(receivedArgs).toContain('PROMPT=dodge blocks');
    expect(receivedArgs).toContain('test-image');
  });

  it('wraps docker failures in a clear error', async () => {
    const generator = new ContainerGameGenerator({
      runDocker: async () => {
        throw new Error('docker: command not found');
      },
    });
    await expect(generator.generate('anything')).rejects.toThrow(/container agent-runner failed/);
  });

  describe('docker argv', () => {
    it('denies the network in mock mode, which needs none', () => {
      const args = new ContainerGameGenerator({ mode: 'mock' }).buildDockerArgs('p');
      expect(args.join(' ')).toContain('--network none');
    });

    it('allows the network in external mode, which must reach the auth proxy', () => {
      const args = new ContainerGameGenerator({
        mode: 'external',
        authProxyUrl: 'http://proxy:3002',
        tokenSecret: 's',
      }).buildDockerArgs('p');
      expect(args.join(' ')).toContain('--network bridge');
      expect(args.join(' ')).not.toContain('--network none');
    });

    it('refuses external mode without an auth proxy, rather than falling back to a real key', () => {
      const generator = new ContainerGameGenerator({ mode: 'external' });
      expect(() => generator.buildDockerArgs('p')).not.toThrow(); // argv alone is fine...
      // ...but generating must refuse, because there is nowhere safe to get auth from.
      return expect(generator.generate('p')).rejects.toThrow(/AUTH_PROXY_URL/);
    });

    it('never hands the container a real provider key', async () => {
      const KEY = 'ANTHROPIC_API_KEY';
      const previous = process.env[KEY];
      process.env[KEY] = 'sk-ant-REAL-SECRET-VALUE';
      let seenArgs: string[] = [];
      let seenEnv: Record<string, string> = {};
      try {
        const generator = new ContainerGameGenerator({
          mode: 'external',
          authProxyUrl: 'http://proxy:3002',
          tokenSecret: 'signing-secret',
          jobId: 'job_x',
          runDocker: async (args, env) => {
            seenArgs = args;
            seenEnv = env ?? {};
            return sampleRunnerOutput;
          },
        });
        await generator.generate('make a game');

        // The real key must never reach the container, by any route.
        expect(seenArgs.join(' ')).not.toContain('sk-ant-REAL-SECRET-VALUE');
        expect(seenEnv[KEY]).not.toBe('sk-ant-REAL-SECRET-VALUE');
        // What it gets instead is a job-scoped token, and a base URL aimed at the proxy.
        expect(seenEnv[KEY]).toBeTruthy();
        expect(seenEnv.ANTHROPIC_BASE_URL).toBe('http://proxy:3002');
        // Verifiable as a token for exactly this job.
        expect(verifyJobToken(seenEnv[KEY] as string, 'signing-secret').jobId).toBe('job_x');
      } finally {
        if (previous === undefined) delete process.env[KEY];
        else process.env[KEY] = previous;
      }
    });

    it('keeps the job token out of argv, so it is not in the process list', async () => {
      let seenArgs: string[] = [];
      const generator = new ContainerGameGenerator({
        mode: 'external',
        authProxyUrl: 'http://proxy:3002',
        tokenSecret: 'signing-secret',
        jobId: 'job_y',
        runDocker: async (args) => {
          seenArgs = args;
          return sampleRunnerOutput;
        },
      });
      await generator.generate('make a game');

      const token = mintJobToken('job_y', 'signing-secret');
      expect(seenArgs).toContain('ANTHROPIC_API_KEY'); // forwarded by name...
      expect(seenArgs.join(' ')).not.toContain(token.split('.')[1]); // ...never by value
    });
  });
});
