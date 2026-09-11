/**
 * Every module that reaches a paid vendor seam must also consult a spend counter.
 *
 * The 2026-08-04 incident was not a bug in a limit — it was a new paid call added on a
 * hot read path that no limit covered, billing ~9,250 discarded Vertex requests in a day
 * and returning 200 every time. Nothing structural would have caught it: the code was
 * correct, and the only signal was the billing console.
 *
 * This is that structural check. A file that imports one of the paid seams below has to
 * name a counter too — a gate, a quota, a peek, or an explicit allowance — or say why it
 * does not with a one-line waiver:
 *
 *   // eslint-disable-next-line gamedev/metered-call -- <why this call needs no counter>
 *
 * Deliberately coarse. It cannot tell whether the counter actually precedes the call, so
 * it does not try; the ordering is what the tests pin. What it does catch is the case
 * that actually happened — a paid call with no counter in sight at all.
 *
 * Rationale and the wider ceiling inventory: `cost-controls-execution-plan.md` in the
 * private gamedevpl/www.gamedev.pl-ops repo (see AGENTS.md).
 */
import path from 'node:path';


// Modules whose use bills somebody. Kept explicit rather than pattern-matched: a new
// vendor seam should be a deliberate line here, not something a regex quietly covers.
const PAID_SEAMS = [
  'platform/genai.js',
  'creation/knowledge-search.js',
  'catalog/embedding-service.js',
  'agent-surface/managed-provider',
  'delivery/gate-trigger.js',
];

/**
 * Lanes whose gate lives at their caller, and which gate that is.
 *
 * A lane module is the wrong place for a ceiling: the route knows who is asking and
 * what their quota is, the lane only knows how to make the call. Keeping the map here
 * rather than as a disable comment per file means the whole "what bounds what" picture
 * is readable in one place — and a new lane has to join it deliberately.
 */
const GATED_AT_CALLER = {
  'creation/chat-agent.ts': 'chatGate, in chat-orchestration.ts',
  'creation/intake-agent.ts': 'chatGate and chats quota, in cli-chat-routes.ts',
  'creation/code-lane.ts': 'editingGate, in remix.ts',
  'creation/editor-assist.ts': 'editingGate, in editor-drafts.ts',
  'creation/tab-complete.ts': 'tabCompleteGate, in creator-code.ts',
  'creation/seed-provider-vertex.ts': 'seedAvailabilityGate, in seed-pipeline.ts',
  'community/feedback-themes.ts': 'THEME_CALL_BUDGET, in scorecard.ts',
  'catalog/catalog-enricher.ts': 'enrichmentAttempted, in catalog-indexer.ts',
  'catalog/embedding-service.ts': 'searchGate via beforePaidCall, in catalog-search-routes.ts',
};

function gatedAtCaller(filename) {
  const normalized = filename.split(path.sep).join('/');
  return Object.keys(GATED_AT_CALLER).some((suffix) => normalized.endsWith(suffix));
}

// Any of these in the same file reads as "this module knows what it spends".
const COUNTER_HINTS = [
  'Gate',
  'gate',
  'Quota',
  'quota',
  'checkAndIncrement',
  'checkAndSpend',
  'peek',
  'spendSeedSlot',
  'Allowance',
  'allowance',
];

function importsPaidSeam(source) {
  return PAID_SEAMS.some((seam) => source.includes(seam));
}

export default {
  rules: {
    'metered-call': {
      meta: {
        type: 'problem',
        docs: { description: 'A module that reaches a paid vendor seam must also name a spend counter.' },
        schema: [],
        messages: {
          unmetered:
            'This module imports the paid seam "{{source}}" but names no spend counter. ' +
            'Consult a gate or quota before the call, or add an eslint-disable-next-line ' +
            'gamedev/metered-call comment saying why none is needed.',
        },
      },
      create(context) {
        if (gatedAtCaller(context.filename ?? context.getFilename())) return {};
        const paidImports = [];
        let sawCounter = false;

        return {
          ImportDeclaration(node) {
            const source = String(node.source.value ?? '');
            // `import type` costs nothing at runtime; only a value import can bill.
            const typeOnly =
              node.importKind === 'type' ||
              (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === 'type'));
            if (!typeOnly && importsPaidSeam(source)) paidImports.push({ node, source });
            if (COUNTER_HINTS.some((hint) => source.includes(hint))) sawCounter = true;
          },
          Identifier(node) {
            if (!sawCounter && COUNTER_HINTS.some((hint) => node.name.includes(hint))) sawCounter = true;
          },
          'Program:exit'() {
            if (sawCounter) return;
            for (const { node, source } of paidImports) {
              context.report({ node, messageId: 'unmetered', data: { source } });
            }
          },
        };
      },
    },
  },
};
