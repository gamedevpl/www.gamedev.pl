import type { KnowledgeScope } from './knowledge-search.js';

export function scopeToFilter(scope: KnowledgeScope | undefined): string {
  switch (scope) {
    case 'kit':
      return 'corpus: ANY("kit-api","module","vertical","digest")';
    case 'editor':
      return 'corpus: ANY("editor")';
    case 'examples':
      return 'corpus: ANY("example")';
    case 'docs':
      return 'corpus: ANY("doc","skill")';
    default:
      return 'corpus: ANY("kit-api","module","vertical","digest","editor","example","doc","skill")';
  }
}

// Example code is ~70% of the corpus and crowded kit answers out of an unscoped search.
export const EXAMPLE_DEMOTION = -0.5;

export function scopeToBoostSpec(scope: KnowledgeScope | undefined) {
  if (scope) return undefined;
  return { conditionBoostSpecs: [{ condition: 'corpus: ANY("example")', boost: EXAMPLE_DEMOTION }] };
}

export function isCreatorSpec(corpus: string | undefined, repoPath: string | undefined): boolean {
  return corpus === 'spec' || /(?:^|\/)SPEC\.md(?:[?#]|$)/i.test(repoPath ?? '');
}
