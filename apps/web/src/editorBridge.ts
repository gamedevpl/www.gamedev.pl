import { useEffect, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { fetchGameEditor } from './studioApi.js';

/**
 * The shell half of EditorKit's draft hot-apply (the game half is the games
 * repo's `shared/modules/editor.ts`).
 *
 * When the creator playtests their own editable game, the game's editor module
 * announces itself with `editor:hello`; this hook answers with the creator's
 * saved draft (`editor:content`), and the game re-enters play on the new
 * content — the edit-to-playing loop, seconds, no build.
 *
 * Deliberately pull-based and owner-only: nothing is pushed until the game
 * *inside this creator's own playtest frame* asks, the draft comes from the
 * owner-scoped editor API (anyone else gets 404), and a game without the editor
 * module never says hello, so every other playtest carries zero editor traffic.
 * Everything arriving from the frame is hostile input: only the `editor:hello`
 * type is read, and nothing from the game is echoed back beyond the draft.
 */
export function useEditorDraftBridge(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  slug: string | undefined,
  editable: boolean,
): void {
  useEffect(() => {
    if (!active || !slug || !editable) return;

    let disposed = false;
    /** One fetch per playtest session; a hello after the first reuses it. */
    let draftPromise: Promise<unknown | null> | null = null;

    function loadDraft(): Promise<unknown | null> {
      draftPromise ??= fetchGameEditor(slug as string)
        .then((state) => state.draft?.content ?? null)
        .catch(() => null);
      return draftPromise;
    }

    function onMessage(event: MessageEvent) {
      // Opaque-origin frame: origin is "null" and the source must be our iframe.
      if (event.origin !== 'null') return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.ns !== BRIDGE_NAMESPACE || data.v !== PROTOCOL_VERSION) return;
      if (data.t !== 'editor:hello') return;

      void loadDraft().then((content) => {
        if (disposed || content === null) return;
        frameRef.current?.contentWindow?.postMessage(
          { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:content', content },
          '*',
        );
      });
    }

    window.addEventListener('message', onMessage);
    return () => {
      disposed = true;
      window.removeEventListener('message', onMessage);
    };
  }, [frameRef, active, slug, editable]);
}
