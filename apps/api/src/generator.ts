import { ContainerGameGenerator, MockGameGenerator, type GameGenerator } from '@gamedevpl/game-generator';

/**
 * Selects the game generator based on the LLM_PROVIDER env var. Defaults to the
 * offline 'mock'. 'container' runs the agent-runner image (mock mode by default,
 * zero tokens) — see containers/agent-runner/README.md. A hosted real agent plugs
 * in here later.
 */
export function createGenerator(provider = process.env.LLM_PROVIDER ?? 'mock'): GameGenerator {
  switch (provider) {
    case 'mock':
      return new MockGameGenerator();
    case 'container':
      return new ContainerGameGenerator();
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Supported: mock, container.`);
  }
}
