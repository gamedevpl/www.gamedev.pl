import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorParamValue } from './studioApi.js';
import type { RemixChanged, RemixChatTurn } from './remixSessionPersist.js';

type Lane = 'idle' | 'asking' | 'building';

// Mini-chat scrollback — only after the panel has docked into chat mode.
export function RemixTranscript({
  transcriptRef,
  chatMode,
  chatTurns,
  lane,
  slow,
  undo,
  changed,
  onUndo,
  onUndoCode,
}: {
  transcriptRef: RefObject<HTMLOListElement>;
  chatMode: boolean;
  chatTurns: RemixChatTurn[];
  lane: Lane;
  slow: boolean;
  undo: Record<string, EditorParamValue> | null;
  changed: RemixChanged | null;
  onUndo: () => void;
  onUndoCode: () => void;
}) {
  const { t } = useTranslation();
  if (!chatMode || chatTurns.length === 0) return null;
  const working = lane === 'asking' || lane === 'building';
  return (
    <ol ref={transcriptRef} className="remix-transcript" aria-label={t('remix.chatAria')}>
      {chatTurns.map((turn) => (
        <li key={turn.id} className={`remix-bubble is-${turn.role}${turn.missed ? ' is-miss' : ''}`}>
          <span className="remix-bubble-text">{turn.text}</span>
          {turn.canUndo && (undo || changed?.undoCode) ? (
            <button
              type="button"
              className={`remix-bubble-undo${changed?.broke ? ' is-urgent' : ''}`}
              disabled={lane !== 'idle'}
              onClick={() => (changed?.undoCode ? onUndoCode() : onUndo())}
            >
              {t('remix.undo')}
            </button>
          ) : null}
        </li>
      ))}
      {working ? (
        <li className="remix-bubble is-assistant is-pending" aria-live="polite">
          <span className="remix-bubble-text">
            {lane === 'building' ? (slow ? t('remix.buildingSlow') : t('remix.building')) : t('remix.asking')}
          </span>
          {lane === 'building' ? (
            <span className="remix-bar" aria-hidden="true">
              <i />
            </span>
          ) : null}
        </li>
      ) : null}
    </ol>
  );
}

// Chat mode puts Undo on the bubble; this row keeps Share.
export function RemixActionRow({
  chatMode,
  lane,
  undo,
  changed,
  canPropose,
  proposing,
  proposed,
  onShare,
  onPropose,
  onUndo,
  onUndoCode,
}: {
  chatMode: boolean;
  lane: Lane;
  undo: Record<string, EditorParamValue> | null;
  changed: RemixChanged | null;
  canPropose: boolean | null;
  proposing: boolean;
  proposed: boolean;
  onShare: () => void;
  onPropose: () => void;
  onUndo: () => void;
  onUndoCode: () => void;
}) {
  const { t } = useTranslation();
  // Undo must not compete with the bubble message it undoes.
  const showUndo = !chatMode && Boolean(undo || changed?.undoCode);
  if (!changed || !(changed.canShare || canPropose || showUndo)) return null;
  return (
    <div className="remix-actions-row">
      {changed.canShare ? (
        <button type="button" className="remix-btn is-primary" onClick={onShare}>
          {t('remix.share')}
        </button>
      ) : null}
      {canPropose && !proposing && !proposed ? (
        <button type="button" className="remix-btn is-quiet" onClick={onPropose}>
          {t('propose.action')}
        </button>
      ) : null}
      {showUndo ? (
        <button
          type="button"
          className={`remix-btn ${changed.broke ? 'is-primary' : 'is-quiet'}`}
          disabled={lane !== 'idle'}
          onClick={() => (changed.undoCode ? onUndoCode() : onUndo())}
        >
          {t('remix.undo')}
        </button>
      ) : null}
    </div>
  );
}
