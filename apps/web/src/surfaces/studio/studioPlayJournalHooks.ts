import { createContext, useContext, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { PLAY_JOURNAL_RECORDER, type PlayJournalAttachment } from '@gamedevpl/contract';
import { isFromGameFrame, postToGameFrame } from '../../frameMessage.js';
import { PlayJournalBuffer } from './playJournalBuffer.js';
export const JournalContext = createContext<PlayJournalBuffer | null>(null);
export function useStudioJournalRecorder(
  frame: MutableRefObject<HTMLIFrameElement | null>,
  html: string | null,
  version: string,
) {
  const buffer = useContext(JournalContext);
  const source = useMemo(() => ({ id: crypto.randomUUID(), html, version }), [html, version]);
  useEffect(() => {
    if (!buffer) return;
    buffer.reset();
    const onMessage = (event: MessageEvent) => {
      const m = event.data;
      if (!isFromGameFrame(event, frame.current) || m?.source !== 'gdpl-journal' || m.context?.id !== source.id) return;
      const through = buffer.append(m, source.version);
      if (through !== null)
        postToGameFrame(frame.current, { source: 'gdpl-journal-host', recordingId: m.recordingId, through });
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      buffer.reset();
    };
  }, [buffer, frame, source]);
  return buffer
    ? `(function(){const gdplJournalContext=${JSON.stringify({ id: source.id }).replace(/</g, '\\u003c')};${PLAY_JOURNAL_RECORDER}})();`
    : undefined;
}
export function useJournalAttachment() {
  const buffer = useContext(JournalContext);
  const [attached, setAttached] = useState<PlayJournalAttachment | null>(null);
  return { buffer, attached, setAttached };
}
