import { describe, expect, it } from 'vitest';
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

    it('allows the network in external mode, which must reach a model API', () => {
      const args = new ContainerGameGenerator({ mode: 'external' }).buildDockerArgs('p');
      expect(args.join(' ')).toContain('--network bridge');
      expect(args.join(' ')).not.toContain('--network none');
    });

    it('forwards credentials by name only, keeping values out of argv', () => {
      const KEY = 'ANTHROPIC_API_KEY';
      const previous = process.env[KEY];
      process.env[KEY] = 'sk-ant-super-secret-value';
      try {
        const args = new ContainerGameGenerator({ mode: 'external' }).buildDockerArgs('p');
        // The name is forwarded so docker reads the value from our env...
        expect(args).toContain(KEY);
        // ...but the secret itself must never appear in the argv we spawn.
        expect(args.join(' ')).not.toContain('sk-ant-super-secret-value');
        expect(args).not.toContain(`${KEY}=sk-ant-super-secret-value`);
      } finally {
        if (previous === undefined) delete process.env[KEY];
        else process.env[KEY] = previous;
      }
    });

    it('omits env vars that are not set on the host', () => {
      const KEY = 'ANTHROPIC_API_KEY';
      const previous = process.env[KEY];
      delete process.env[KEY];
      try {
        const args = new ContainerGameGenerator({ mode: 'external' }).buildDockerArgs('p');
        expect(args).not.toContain(KEY);
      } finally {
        if (previous !== undefined) process.env[KEY] = previous;
      }
    });
  });
});
