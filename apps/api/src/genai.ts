import { genaicode, type GenAIClient } from 'genaicode';
import { vertexAI } from 'genaicode/providers';

// Single place where this app talks to Vertex AI. The three LLM call sites
// (content moderation, spec refinement, and build-log translation) used to
// hand-roll the same GoogleAuth dance, endpoint-URL construction, and
// candidate-unwrapping; genaicode collapses that into a provider + request
// builder, so the only thing left here is resolving *our* env-var contract
// (VERTEX_*) into provider options.
type VertexProviderOptions = NonNullable<Parameters<typeof vertexAI>[0]>;

export type VertexGenerationConfig = VertexProviderOptions['generationConfig'];

export interface VertexClientConfig {
  projectId?: string;
  region?: string;
  model?: string;
  // Per-call-site fallbacks, used when neither the caller nor the env sets one.
  // They differ by call site (moderation and refinement run different models),
  // which is why they are required rather than baked in here.
  defaultRegion: string;
  defaultModel: string;
  generationConfig?: VertexGenerationConfig;
}

export function resolveProjectId(projectId?: string): string {
  return projectId ?? process.env.VERTEX_PROJECT_ID ?? process.env.PROJECT_ID ?? 'gamedevpl';
}

/**
 * Build a genaicode client bound to Vertex AI.
 *
 * Note there is no endpoint/host handling here: `@google/genai` routes the
 * global endpoint (`location: 'global'`, where the Gemini 3 family is served)
 * and regional endpoints itself, so a region change can no longer produce an
 * invalid hostname the way manual URL building could.
 */
export function createVertexClient(config: VertexClientConfig): GenAIClient {
  return genaicode(
    vertexAI({
      project: resolveProjectId(config.projectId),
      location: config.region ?? process.env.VERTEX_REGION ?? config.defaultRegion,
      model: config.model ?? process.env.VERTEX_MODEL ?? config.defaultModel,
      generationConfig: config.generationConfig,
    }),
  );
}
