// Stand-in models. See docs/content-safety-plan.md.

// Only what Vertex serves us; Claude arrives via the seed providers.
const VERTEX_PEERS = new Set(['gemini-3.8-flash']);

// No default: a stand-in is a third attempt, someone is waiting.
export function resolveRefineFallbackModel(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = env.REFINE_FALLBACK_MODEL?.trim();
  if (!configured) return undefined;
  if (!VERTEX_PEERS.has(configured)) {
    console.warn(`Refusing refine fallback to '${configured}': not a peer-or-better model on Vertex.`);
    return undefined;
  }
  return configured;
}
