import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { submitImprovement } from '../../studioApi.js';
import { submitFeedback, type SubmissionApiError } from '../../submissionApi.js';
import { toFeedbackContext } from './studioFeedbackContext.js';
import type { useCreatorPlaytest } from '../../gamePlayer.js';
import type { useJournalAttachment } from './studioPlayJournalHooks.js';

type Playtest = ReturnType<typeof useCreatorPlaytest>;
export function useStageFeedback({
  token,
  published,
  posture,
  paused,
  snapshot,
  instrumentation,
  clearSnapshot,
  resume,
  onImproved,
  journalAttachment,
  journalEnabled,
}: {
  token: string;
  published: boolean;
  posture: string;
  onImproved?: (token: string) => void;
  journalAttachment: ReturnType<typeof useJournalAttachment>;
  journalEnabled: boolean;
} & Pick<Playtest, 'paused' | 'snapshot' | 'instrumentation' | 'clearSnapshot' | 'resume'>) {
  const { t } = useTranslation();
  const [noteText, setNoteText] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const promptOpen = posture === 'play' && Boolean(paused || snapshot);
  const attachedPng = snapshot?.pngBase64 ?? null;
  const trimmedNote = noteText.trim();

  async function sendNote() {
    if (trimmedNote.length < 10) return;
    setSendState('sending');
    setSendError(null);
    const context = {
      ...toFeedbackContext(attachedPng, snapshot?.instrumentation ?? instrumentation),
      ...(journalEnabled && journalAttachment.attached ? { playJournal: journalAttachment.attached } : {}),
    };
    try {
      if (published) {
        const result = await submitImprovement(token, trimmedNote, context);
        // No token means the agent replied instead of opening a round.
        if (result.token) onImproved?.(result.token);
      } else {
        await submitFeedback(token, trimmedNote, context);
      }
      journalAttachment.setAttached(null);
      setSendState('sent');
      setNoteText('');
      clearSnapshot();
      if (paused) resume();
    } catch (err) {
      const apiErr = err as SubmissionApiError;
      const message = err instanceof Error ? err.message : '';
      setSendError(
        message === 'content_rejected'
          ? t('errors.contentRejected.other')
          : apiErr.status === 429 || message.includes('too many')
            ? t('studioPanel.improve.rateLimit')
            : t('studioPanel.improve.error'),
      );
      setSendState('idle');
    }
  }

  return { noteText, setNoteText, sendState, setSendState, sendError, promptOpen, attachedPng, trimmedNote, sendNote };
}
