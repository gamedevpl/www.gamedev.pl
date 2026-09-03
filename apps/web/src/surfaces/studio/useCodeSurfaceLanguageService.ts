import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCodeSurfaceKitDeclaration, type CodeSurfaceSources } from './codeSurfaceApi.js';
import { flushLanguageFileUpdates, queueLanguageFileUpdate } from './codeSurfaceLanguageBind.js';
import { createCodeSurfaceLanguageService, type CodeSurfaceLanguageService } from './codeSurfaceLanguageService.js';
import { isTsPath } from './codeSurfaceHelpers.js';

// GA-04: the TS worker's lifecycle, not its callers'.
export function useCodeSurfaceLanguageService({
  slug,
  editable,
  sourcesRef,
  draftsRef,
}: {
  slug: string;
  editable: boolean;
  sourcesRef: { current: CodeSurfaceSources | null };
  draftsRef: { current: Record<string, string> };
}) {
  // GA-04: a ref, not state — `ready` below signals it exists.
  const serviceRef = useRef<CodeSurfaceLanguageService | null>(null);
  const pendingUpdatesRef = useRef<Array<{ path: string; content: string | null }>>([]);
  const initRef = useRef(false);
  const [ready, setReady] = useState(false);

  // State, not a ref: a null worker leaves `ready` false forever.
  const [kitDeclaration, setKitDeclaration] = useState<string | null>(null);

  // GA-04: keyed on editable/slug — avoids a re-fetch cleanup race.
  useEffect(() => {
    if (!editable || initRef.current) return undefined;
    const sourcesAtStart = sourcesRef.current;
    if (!sourcesAtStart) return undefined;
    initRef.current = true;
    let cancelled = false;
    const initialFiles = Object.fromEntries(
      sourcesAtStart.files
        .filter((entry) => isTsPath(entry.path))
        .map((entry) => [entry.path, draftsRef.current[entry.path] ?? entry.content]),
    );
    void (async () => {
      const kit = await fetchCodeSurfaceKitDeclaration(slug);
      if (cancelled) return;
      setKitDeclaration(kit?.declaration ?? null);
      const service = await createCodeSurfaceLanguageService(initialFiles, kit?.declaration ?? null);
      if (cancelled) {
        service?.destroy();
        return;
      }
      serviceRef.current = service;
      if (service) flushLanguageFileUpdates(pendingUpdatesRef.current, service);
      setReady(service !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, [editable, slug, sourcesRef, draftsRef]);

  // Slug change or unmount tears the worker down for a rebuild.
  useEffect(() => {
    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
      pendingUpdatesRef.current = [];
      initRef.current = false;
      setReady(false);
      setKitDeclaration(null);
    };
  }, [slug]);

  // Queued while the worker boots, applied straight through once it is up.
  const queueUpdate = useCallback((path: string, content: string | null) => {
    queueLanguageFileUpdate(pendingUpdatesRef.current, serviceRef.current, path, content);
  }, []);

  return { ready, serviceRef, kitDeclaration, queueUpdate };
}
