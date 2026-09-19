import { isBuilderKind, type BuilderKind } from './builderKind.js';

export interface CreatorQaProgressState {
  step: number;
  maxStepReached: number;
  title: string;
  baselineTitle: string;
  builder: BuilderKind;
  baselineBuilder: BuilderKind;
  selectedAnswers: Record<string, string[]>;
  customText: Record<string, string>;
}

// Returns true if any wizard progress would be lost on exit.
export function hasCreatorQaProgress(state: CreatorQaProgressState): boolean {
  if (state.step > 0 || state.maxStepReached > 0) return true;
  if (state.title.trim() !== state.baselineTitle.trim()) return true;
  if (Object.values(state.selectedAnswers).some((opts) => opts && opts.length > 0)) return true;
  if (Object.values(state.customText).some((txt) => txt && txt.trim().length > 0)) return true;
  if (state.builder !== (isBuilderKind(state.baselineBuilder) ? state.baselineBuilder : 'platform')) return true;
  return false;
}
