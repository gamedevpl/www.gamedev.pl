import { autocompletion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { tsFacet, tsGoto, tsSync } from '@valtown/codemirror-ts';
import {
  completionVisibilityExtension,
  measuredTsAutocomplete,
  type CompletionTracker,
} from './codeMirrorCompletion.js';
import { tsAdvisoryLintSource } from './codeMirrorDiagnostics.js';
import { makeGotoHandler, modifierAwareHover, modifierHoverExtension, modifierHoverState } from './codeMirrorHover.js';
import type { CodeMirrorLanguageService, CompletionReporter, GotoDefinitionHandler } from './codeMirrorTypes.js';

// GA-05: workers become ready without remounting the editor.
export function languageServiceExtensions(
  languageService: CodeMirrorLanguageService | undefined,
  onGotoDefinitionRef: { current: GotoDefinitionHandler | undefined },
  report?: CompletionReporter,
): Extension[] {
  if (!languageService) return [];
  const hover = modifierAwareHover();
  const completionTracker: CompletionTracker = { pending: [], report };
  return [
    tsFacet.of({ worker: languageService.worker, path: languageService.path }),
    tsSync(),
    modifierHoverState,
    autocompletion({ override: [measuredTsAutocomplete(completionTracker)] }),
    completionVisibilityExtension(completionTracker),
    hover,
    modifierHoverExtension(hover),
    tsGoto({ gotoHandler: makeGotoHandler(onGotoDefinitionRef) }),
    linter(tsAdvisoryLintSource),
  ];
}
