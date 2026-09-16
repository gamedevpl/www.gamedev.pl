import type { KnowledgeMode, KnowledgeQueryResult } from '../creation/knowledge-search.js';

// Fail-open: a soft cap degrades to a warning, not an error.
export function knowledgeCapWarning(mode: KnowledgeMode, cap: number): KnowledgeQueryResult {
  return {
    mode,
    fallback: false,
    chunks: [],
    repoPaths: [],
    guidance: 'Verify exact API signatures via get_kit_api / read_kit_file rather than prose.',
    truncated: false,
    cached: false,
    warnings: [
      {
        code: 'rate_limited',
        message: `Per-round knowledge_query ${mode} cap reached (${cap}/hour) — try a narrower query or wait.`,
      },
    ],
  };
}
