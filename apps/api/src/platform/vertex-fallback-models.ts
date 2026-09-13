// Stand-in models. See docs/content-safety-plan.md.

// Peers of gemini-3.8-flash on Vertex; cheaper models are refused.
const VERTEX_PEERS = new Set(['gemini-3.8-flash', 'claude-sonnet-5', 'claude-opus-5']);

export function resolveRefineFallbackModel(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = env.REFINE_FALLBACK_MODEL?.trim();
  if (!configured) return 'claude-sonnet-5';
  if (!VERTEX_PEERS.has(configured)) {
    console.warn(`Refusing refine fallback to '${configured}': not a peer-or-better model on Vertex.`);
    return undefined;
  }
  return configured;
}
