import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from './AuthContext.js';
import { saveLastBuilder, type BuilderKind } from './builderKind.js';
import { MIN_CONCEPT_LENGTH } from './conceptLength.js';
import { studioConnectPath, studioWelcomePath } from './core/router.js';
import type { QAQuestion } from './CreatorQA.js';
import { deriveTitleFromConcept } from './gameTitle.js';
import { saveSpec, type SavedSpec } from './mySpecs.js';
import { clearPendingQa, loadPendingQa, savePendingQa, type PendingQaAnswers } from './pendingQa.js';
import { refineSpec, submitSpec, type PlatformBuilderAvailability, type SubmissionApiError } from './submissionApi.js';
import { submissionErrorKey } from './submissionErrors.js';
import { recordCreateStep, recordStudioStep } from './visitTelemetry.js';
import type { Navigate } from './useAppNavigation.js';

export type SubmissionStatus = 'idle' | 'refining' | 'loading';

export type PendingSpec = { title: string; concept: string; displayName: string };

export type UseSpecSubmissionFlowOptions = {
  user: User | null;
  navigate: Navigate;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  setSavedSpecs: Dispatch<SetStateAction<SavedSpec[]>>;
  setMyGamesRefreshKey: Dispatch<SetStateAction<number>>;
};

export type UseSpecSubmissionFlowResult = {
  submissionStatus: SubmissionStatus;
  submissionError: string | null;
  pendingSpec: PendingSpec | null;
  qaQuestions: QAQuestion[];
  qaBuilder: BuilderKind;
  qaFormKey: number;
  latestAnswersRef: MutableRefObject<PendingQaAnswers>;
  platformBuilderAvailability: PlatformBuilderAvailability | undefined;
  setPlatformBuilderAvailability: Dispatch<SetStateAction<PlatformBuilderAvailability | undefined>>;
  handleSubmitSpec: (concept: string, displayName?: string, referenceImages?: string[]) => Promise<void>;
  handleQaComplete: (finalConcept: string, title: string, builder: BuilderKind) => Promise<void>;
  handleQaCancel: () => void;
  handleQaAnswersChange: (answers: PendingQaAnswers) => void;
  handleQaTitleChange: (title: string) => void;
  handleQaBuilderChange: (builder: BuilderKind) => void;
};

// The generation gate, from the first refine call to a created submission.
export function useSpecSubmissionFlow({
  user,
  navigate,
  setIsAuthModalOpen,
  setSavedSpecs,
  setMyGamesRefreshKey,
}: UseSpecSubmissionFlowOptions): UseSpecSubmissionFlowResult {
  const { t, i18n } = useTranslation();

  // 'refining' is the pre-submission refine call; nothing is submitted yet.
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submissionStatusRef = useRef(submissionStatus);
  submissionStatusRef.current = submissionStatus;

  // The clarifying-questions gate, seeded from localStorage so a reload resumes.
  const restoredQa = useRef(loadPendingQa());
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>(restoredQa.current?.questions ?? []);
  const [pendingSpec, setPendingSpec] = useState<PendingSpec | null>(restoredQa.current?.spec ?? null);
  // Kept out of pendingSpec — too large for its localStorage-backed persistence.
  const pendingReferenceImagesRef = useRef<string[] | undefined>(undefined);
  // Language the parked questions were written in; a mismatch re-asks.
  const [qaLocale, setQaLocale] = useState<string>(restoredQa.current?.locale ?? '');
  // Who builds this round, parked so a reload keeps it.
  const [qaBuilder, setQaBuilder] = useState<BuilderKind>(restoredQa.current?.builder ?? 'platform');
  const qaBuilderRef = useRef(qaBuilder);
  qaBuilderRef.current = qaBuilder;
  // Whether the platform builder can be picked right now.
  const [platformBuilderAvailability, setPlatformBuilderAvailability] = useState<PlatformBuilderAvailability>();
  // Bumped so CreatorQA remounts with empty answers after a re-ask.
  const [qaFormKey, setQaFormKey] = useState(0);
  // Beside the QA state so the language switch can clear it.
  const latestAnswersRef = useRef<PendingQaAnswers>(restoredQa.current?.answers ?? { selected: {}, custom: {} });

  // AI questions don't follow the language switcher; re-ask on change.
  const qaRelocalizingRef = useRef(false);
  const pendingSpecRef = useRef(pendingSpec);
  pendingSpecRef.current = pendingSpec;
  // Concept-only dep: a title edit must not restart the switch.
  useEffect(() => {
    const parked = pendingSpecRef.current;
    if (!parked) return;
    const targetLocale = i18n.resolvedLanguage ?? i18n.language;
    if (qaLocale === targetLocale) return;
    // A real submit is in flight; leave its questions alone.
    if (submissionStatusRef.current === 'loading') return;
    if (qaRelocalizingRef.current) return;

    let cancelled = false;
    qaRelocalizingRef.current = true;
    setSubmissionStatus('refining');
    const concept = parked.concept;

    async function relocalizeQa() {
      try {
        const refined = await refineSpec({ concept, locale: targetLocale });
        if (cancelled) return;
        // A real submit started while refine was in flight — drop the relocalization.
        if (submissionStatusRef.current === 'loading') return;

        const questions = refined.questions;
        // Fail-open refine returns no questions; keep the parked ones.
        if (questions.length === 0) return;

        // The live parked spec, so a mid-flight title edit survives.
        const liveSpec = pendingSpecRef.current;
        if (!liveSpec) return;

        // Preserve user-entered custom answers across questions matching by ID or index.
        const oldCustom = latestAnswersRef.current.custom ?? {};
        const oldQuestions = qaQuestions;
        const preservedCustom: Record<string, string> = {};

        questions.forEach((newQ, idx) => {
          const customById = oldCustom[newQ.id];
          const oldQ = oldQuestions[idx];
          const customByIndex = oldQ ? oldCustom[oldQ.id] : undefined;
          const val = customById || customByIndex;
          if (val && val.trim()) {
            preservedCustom[newQ.id] = val;
          }
        });

        const newAnswers: PendingQaAnswers = { selected: {}, custom: preservedCustom };

        setQaQuestions(questions);
        setQaLocale(targetLocale);
        latestAnswersRef.current = newAnswers;
        // Drop restored answers so a remounted panel doesn't revive English selections.
        if (restoredQa.current) {
          restoredQa.current = {
            ...restoredQa.current,
            questions,
            answers: newAnswers,
            locale: targetLocale,
            savedAt: Date.now(),
          };
        }
        savePendingQa({
          spec: liveSpec,
          questions,
          answers: newAnswers,
          locale: targetLocale,
          builder: qaBuilderRef.current,
        });
        setQaFormKey((key) => key + 1);
      } catch {
        // Keep the previous questions rather than blanking the panel on a blip.
      } finally {
        qaRelocalizingRef.current = false;
        if (!cancelled && submissionStatusRef.current === 'refining') {
          setSubmissionStatus('idle');
        }
      }
    }

    void relocalizeQa();
    return () => {
      cancelled = true;
      // Strict Mode remounts must be able to start a new call.
      qaRelocalizingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- concept-only deps
  }, [i18n.language, i18n.resolvedLanguage, pendingSpec?.concept, qaLocale]);

  // The generation gate: refine first, then either questions or straight through.
  async function handleSubmitSpec(concept: string, displayName: string = '', referenceImages?: string[]) {
    if (!user) {
      // The wall between writing an idea and making an account.
      recordCreateStep('signin_required');
      setIsAuthModalOpen(true);
      return;
    }

    const trimmedConcept = concept.trim();
    if (!trimmedConcept) return;

    // Catch a too-short concept before the fail-open refiner would.
    if (trimmedConcept.length < MIN_CONCEPT_LENGTH) {
      setSubmissionError(t('errors.conceptTooShort', { minLength: MIN_CONCEPT_LENGTH }));
      return;
    }

    setSubmissionStatus('refining');
    setSubmissionError(null);

    let questions: QAQuestion[];
    let suggestedTitle: string | undefined;
    try {
      const refined = await refineSpec({ concept: trimmedConcept, locale: i18n.language });
      questions = refined.questions;
      suggestedTitle = refined.suggestedTitle;
    } catch {
      // Fail-closed: stop rather than fall through to a truncated title.
      setSubmissionError(t('errors.refineFailed'));
      setSubmissionStatus('idle');
      return;
    }

    if (questions.length > 0) recordCreateStep('qa_shown');

    // The confirm step is where the game gets its name.
    const spec = {
      title: suggestedTitle ?? deriveTitleFromConcept(trimmedConcept),
      concept: trimmedConcept,
      displayName: displayName.trim(),
    };
    const locale = i18n.resolvedLanguage ?? i18n.language;
    pendingReferenceImagesRef.current = referenceImages;
    setPendingSpec(spec);
    setQaQuestions(questions);
    setQaLocale(locale);
    setQaBuilder('platform');
    latestAnswersRef.current = { selected: {}, custom: {} };
    savePendingQa({
      spec,
      questions,
      answers: { selected: {}, custom: {} },
      locale,
      builder: 'platform',
    });
    setQaFormKey((key) => key + 1);
    setSubmissionStatus('idle');
  }

  // Creates the submission after the QA gate, then jumps to Studio.
  async function submitRefinedSpec(title: string, concept: string, displayName: string, builder: BuilderKind) {
    setSubmissionStatus('loading');
    setSubmissionError(null);

    try {
      const response = await submitSpec({
        title,
        concept,
        displayName: displayName || undefined,
        // The agent writes progress updates in the creator's language.
        locale: i18n.language,
        builder,
        referenceImages: pendingReferenceImagesRef.current,
      });

      // Save to localStorage
      const updatedSpecs = saveSpec({
        token: response.token,
        title,
        concept,
        createdAt: Date.now(),
        ...(response.slug ? { slug: response.slug } : {}),
      });
      setSavedSpecs(updatedSpecs);
      setMyGamesRefreshKey((key) => key + 1);
      saveLastBuilder(response.token, builder);

      setSubmissionStatus('idle');
      recordCreateStep('submission_created', builder);
      recordStudioStep('builder_chosen', builder);

      // Only now is the QA panel done; no-op if never opened.
      setQaQuestions([]);
      setPendingSpec(null);
      pendingReferenceImagesRef.current = undefined;
      setQaLocale('');
      setQaBuilder('platform');
      clearPendingQa();

      // Platform → welcome; self → connect chapter. Never auto-enter Studio.
      const address = response.slug ?? response.token;
      navigate(builder === 'platform' ? studioWelcomePath(address) : studioConnectPath(address));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic');
      const apiErr = err instanceof Error ? (err as SubmissionApiError) : undefined;
      setSubmissionError(
        t(
          submissionErrorKey({
            message,
            ...(apiErr?.status !== undefined ? { status: apiErr.status } : {}),
            ...(apiErr?.category !== undefined ? { category: apiErr.category } : {}),
          }),
        ),
      );
      setSubmissionStatus('idle');
    }
  }

  // The panel stays mounted until the submission lands, error included.
  const handleQaComplete = async (finalConcept: string, title: string, builder: BuilderKind) => {
    const spec = pendingSpec;
    if (!spec) return;
    // The name the creator settled on gates the build.
    recordCreateStep('title_confirmed');
    await submitRefinedSpec(title, finalConcept, spec.displayName, builder);
  };

  const handleQaCancel = () => {
    setQaQuestions([]);
    setPendingSpec(null);
    pendingReferenceImagesRef.current = undefined;
    setQaLocale('');
    setQaBuilder('platform');
    clearPendingQa();
  };

  // Every keystroke lands in storage, so the round survives a reload.
  const handleQaAnswersChange = useCallback(
    (answers: PendingQaAnswers) => {
      latestAnswersRef.current = answers;
      if (!pendingSpec) return;
      savePendingQa({
        spec: pendingSpec,
        questions: qaQuestions,
        answers,
        locale: qaLocale,
        builder: qaBuilder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale, qaBuilder],
  );

  // The edited name is parked too, for the same reason.
  const handleQaTitleChange = useCallback(
    (title: string) => {
      if (!pendingSpec) return;
      const spec = { ...pendingSpec, title };
      setPendingSpec(spec);
      savePendingQa({
        spec,
        questions: qaQuestions,
        answers: latestAnswersRef.current,
        locale: qaLocale,
        builder: qaBuilder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale, qaBuilder],
  );

  const handleQaBuilderChange = useCallback(
    (builder: BuilderKind) => {
      setQaBuilder(builder);
      if (!pendingSpec) return;
      savePendingQa({
        spec: pendingSpec,
        questions: qaQuestions,
        answers: latestAnswersRef.current,
        locale: qaLocale,
        builder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale],
  );

  return {
    submissionStatus,
    submissionError,
    pendingSpec,
    qaQuestions,
    qaBuilder,
    qaFormKey,
    latestAnswersRef,
    platformBuilderAvailability,
    setPlatformBuilderAvailability,
    handleSubmitSpec,
    handleQaComplete,
    handleQaCancel,
    handleQaAnswersChange,
    handleQaTitleChange,
    handleQaBuilderChange,
  };
}
