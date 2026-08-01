import type { BuilderKind } from './builderKind.js';
import { isBuilderKind } from './builderKind.js';
import type { QAQuestion } from './CreatorQA.js';

/**
 * The clarifying-questions session, parked in localStorage.
 *
 * Everything about an in-progress QA round used to live in component state: the
 * spec awaiting answers, the questions, and the answers themselves. A reload — or a
 * phone deciding to reclaim the tab — lost all three, and re-asking cost the creator
 * another of their twenty daily refines to get questions they had already answered.
 *
 * Kept separate from [mySpecs.ts](./mySpecs.ts), which holds *submitted* specs keyed
 * by token. This one is pre-submission and there is only ever one of it.
 */

export interface PendingQaAnswers {
  selected: Record<string, string[]>;
  custom: Record<string, string>;
}

export interface PendingQaSession {
  spec: { title: string; concept: string; displayName: string };
  questions: QAQuestion[];
  answers: PendingQaAnswers;
  /**
   * UI language the questions were authored in. When the creator switches language
   * mid-round, the app re-asks so chips and free-text stay in the language they are
   * reading — without this, a Polish UI would keep showing English AI text.
   */
  locale?: string;
  /** Who should build this round once the confirm panel submits. */
  builder?: BuilderKind;
  savedAt: number;
}

const STORAGE_KEY = 'gamedev_pending_qa';

/**
 * Questions are only meaningful next to the concept that produced them, and a spec
 * abandoned a day ago is not one the creator is still mid-thought about. Restoring
 * something older would be spookier than starting clean.
 */
const MAX_AGE_MS = 24 * 60 * 60_000;

export function loadPendingQa(): PendingQaSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingQaSession;
    // An empty question list is a real session now, not a corrupt one: the confirm
    // panel opens for every concept so the game can be named, and a clean concept
    // reaches it with nothing to clarify. The concept is what makes a session
    // meaningful; the title may legitimately be blank while the creator picks one.
    if (
      !parsed?.spec?.concept ||
      !Array.isArray(parsed.questions) ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      clearPendingQa();
      return null;
    }
    return {
      ...parsed,
      // displayName is optional to the creator, so tolerate its absence in older blobs.
      spec: { ...parsed.spec, title: parsed.spec.title ?? '', displayName: parsed.spec.displayName ?? '' },
      answers: { selected: parsed.answers?.selected ?? {}, custom: parsed.answers?.custom ?? {} },
      ...(typeof parsed.locale === 'string' && parsed.locale ? { locale: parsed.locale } : {}),
      ...(isBuilderKind(parsed.builder) ? { builder: parsed.builder } : {}),
    };
  } catch {
    // Corrupt or unreadable (private mode, disabled storage): start clean rather than
    // letting a bad blob wedge the creation flow on every load.
    return null;
  }
}

export function savePendingQa(session: Omit<PendingQaSession, 'savedAt'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked — persistence is a convenience, never a precondition.
  }
}

export function clearPendingQa(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
