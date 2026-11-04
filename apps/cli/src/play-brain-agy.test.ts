import { describe, expect, it } from 'vitest';
import type { AdapterSpec } from './adapters.js';
import { brainAgent, withoutToolSummary } from './play-brain.js';

describe('play brain with agy', () => {
  it('lets agy drive Play', () => {
    const spec = (name: string) => ({ name, command: name }) as AdapterSpec;
    expect(brainAgent({ adapters: [spec('muse'), spec('agy')] })).toBe('agy');
  });

  it('drops the toolSummary argument agy adds to every MCP call', async () => {
    const seen: Record<string, unknown>[] = [];
    const [tool] = withoutToolSummary([
      {
        name: 'strict',
        description: 'strict',
        validate: (args) => void seen.push(args),
        run: (args) => {
          seen.push(args);
          return 'ok';
        },
      },
    ]);
    tool!.validate!({ toolSummary: 'Observe', x: 1 });
    expect(await tool!.run({ toolSummary: 'Observe', x: 1 })).toBe('ok');
    expect(seen).toEqual([{ x: 1 }, { x: 1 }]);
  });
});
