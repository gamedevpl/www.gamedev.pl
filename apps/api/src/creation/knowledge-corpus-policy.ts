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

export function isCreatorSpec(corpus: string | undefined, repoPath: string | undefined): boolean {
  return corpus === 'spec' || /(?:^|\/)SPEC\.md(?:[?#]|$)/i.test(repoPath ?? '');
}
