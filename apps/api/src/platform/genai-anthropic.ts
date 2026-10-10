import { genaicode, type GenAIClient } from 'genaicode';
import { anthropic } from 'genaicode/providers';

// Claude through the Anthropic API, beside genai.ts's other vendors.

// The seed secret first (wired in prod), then the generic name.
export function resolveAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SEED_ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || undefined;
}

export function createAnthropicClient(config: { model: string; apiKey?: string }): GenAIClient {
  return genaicode(anthropic({ apiKey: config.apiKey ?? resolveAnthropicApiKey(), model: config.model }));
}
