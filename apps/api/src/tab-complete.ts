import { resultText, type GenAIClient, type GenerationResult } from 'genaicode';
import { createVertexClient, type VertexGenerationConfig } from './agent-surface/genai.js';

// TA-01: prompt-based FIM — Vertex Gemini has no suffix field.
export const DEFAULT_TAB_COMPLETE_MODEL = 'gemini-3.7-flash';
export const DEFAULT_TAB_COMPLETE_TIMEOUT_MS = 4000;
// continue.dev's shape: ~700 tokens prefix, ~300 suffix, ~4 chars/token.
export const MAX_PREFIX_CHARS = 3000;
export const MAX_SUFFIX_CHARS = 1200;
// A completion is a few lines, not a whole file — floors cost.
export const MAX_COMPLETION_OUTPUT_TOKENS = 300;

export interface TabCompleteRequest {
  path: string;
  prefixWindow: string;
  suffixWindow: string;
}

export interface TabCompleteResult {
  completion: string;
  tokens?: { input: number; output: number };
  model?: string;
}

export interface TabCompleter {
  complete(request: TabCompleteRequest): Promise<TabCompleteResult>;
}

function stripFences(text: string): string {
  // Trimmed only to detect a fence — real whitespace must survive.
  const fenced = text.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1]! : text;
}

function buildPrompt(request: TabCompleteRequest): string {
  return `You are completing TypeScript code inside a small browser game. Continue the code exactly where PREFIX leaves off, so that it reads naturally into SUFFIX. Do not repeat PREFIX or SUFFIX. Emit code only — no commentary, no markdown fences. If nothing sensible continues the code, reply with an empty string.

File: ${request.path}

PREFIX:
${request.prefixWindow}
SUFFIX:
${request.suffixWindow}

Completion:`;
}

export class VertexTabCompleter implements TabCompleter {
  private client?: GenAIClient;

  constructor(
    private options: {
      client?: GenAIClient;
      projectId?: string;
      region?: string;
      model?: string;
      timeoutMs?: number;
    } = {},
  ) {}

  private getClient(): GenAIClient {
    this.client ??=
      this.options.client ??
      createVertexClient({
        projectId: this.options.projectId,
        region: this.options.region,
        defaultRegion: 'global',
        model: this.options.model,
        defaultModel: DEFAULT_TAB_COMPLETE_MODEL,
        // Thinking eats the same output budget and leaves nothing for the code.
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as VertexGenerationConfig,
      });
    return this.client;
  }

  async complete(request: TabCompleteRequest): Promise<TabCompleteResult> {
    const result: GenerationResult = await this.getClient()(buildPrompt(request))
      .temperature(0.2)
      .maxOutputTokens(MAX_COMPLETION_OUTPUT_TOKENS)
      .signal(AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TAB_COMPLETE_TIMEOUT_MS))
      .run();
    return {
      completion: stripFences(resultText(result)),
      tokens: { input: result.usage?.inputTokens ?? 0, output: result.usage?.outputTokens ?? 0 },
      model: this.options.model ?? process.env.VERTEX_MODEL ?? DEFAULT_TAB_COMPLETE_MODEL,
    };
  }
}

// Deterministic stand-in for tests and local runs with no Vertex access.
export class StubTabCompleter implements TabCompleter {
  constructor(private result: TabCompleteResult = { completion: '' }) {}

  async complete(): Promise<TabCompleteResult> {
    return this.result;
  }
}

export function tabCompleteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Off unless the deploy flag says exactly 'true' — opposite default from CODE_SURFACE.
  return env.TAB_COMPLETE === 'true';
}
