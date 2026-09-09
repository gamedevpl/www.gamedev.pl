import { useEffect, useRef, useState } from 'react';
import { useClampToViewport } from '../../useClampToViewport.js';

// `replacedBy` groups attachments a later pick supersedes.
export type ComposerAttachment = { id: string; name: string; dataUrl: string; replacedBy?: string };

export const MAX_COMPOSER_ATTACHMENTS = 4;

// True when one more attachment fits, once the superseded ones drop out.
export function fitsAttachment(prev: ComposerAttachment[], options?: { replaces?: string }): boolean {
  const kept = options?.replaces ? prev.filter((item) => item.replacedBy !== options.replaces) : prev;
  return kept.length < MAX_COMPOSER_ATTACHMENTS;
}

// Adds one attachment, replacing whatever it supersedes.
export function withAttachment(
  prev: ComposerAttachment[],
  entry: ComposerAttachment,
  options?: { replaces?: string },
): ComposerAttachment[] {
  const kept = options?.replaces ? prev.filter((item) => item.replacedBy !== options.replaces) : prev;
  if (kept.length >= MAX_COMPOSER_ATTACHMENTS) return kept;
  return [...kept, options?.replaces ? { ...entry, replacedBy: options.replaces } : entry];
}

// Attachment state: uploads and sketches, capped at MAX_COMPOSER_ATTACHMENTS.
export function useComposerAttachments(sending: boolean) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // FileReader work not yet landed in attachments — Send waits for it.
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
  // Newest read per group; a slower one cannot land on it.
  const latestRead = useRef(new Map<string, { token: symbol; abort: AbortController }>());
  // What a pick could not attach, so the composer can say so.
  const [blockedAttachment, setBlockedAttachment] = useState<string | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  attachmentsRef.current = attachments;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const attachPanelRef = useClampToViewport<HTMLDivElement>(attachMenuOpen);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [attachMenuOpen]);

  const handleAttachFiles = (files: FileList | File[]) => {
    if (sending) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      setPendingAttachmentReads((count) => count + 1);
      const reader = new FileReader();
      const done = () => setPendingAttachmentReads((count) => count - 1);
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAttachments((prev) =>
            prev.length >= MAX_COMPOSER_ATTACHMENTS
              ? prev
              : [
                  ...prev,
                  { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl },
                ],
          );
        }
        done();
      };
      reader.onerror = done;
      reader.readAsDataURL(file);
    });
  };

  const addAttachment = (name: string, dataUrl: string, options?: { replaces?: string }) => {
    setAttachments((prev) => withAttachment(prev, { id: `${name}-${Date.now()}`, name, dataUrl }, options));
  };

  // Send waits for this like a file read.
  const addAttachmentFromUrl = (name: string, url: string, options?: { replaces?: string }) => {
    const group = options?.replaces;
    const token = Symbol('read');
    const abort = new AbortController();
    if (group) {
      // A superseded read must free Send, not hold it.
      latestRead.current.get(group)?.abort.abort();
      latestRead.current.set(group, { token, abort });
    }
    setPendingAttachmentReads((count) => count + 1);
    void fetchImageAsDataUrl(url, abort.signal)
      .then((dataUrl) => {
        if (!dataUrl) return;
        // A later pick won; this frame answers an old prompt.
        if (group && latestRead.current.get(group)?.token !== token) return;
        // The pick took over the text; a missing frame misleads.
        if (!fitsAttachment(attachmentsRef.current, options)) {
          setBlockedAttachment(name);
          return;
        }
        setBlockedAttachment(null);
        addAttachment(name, dataUrl, options);
      })
      .finally(() => setPendingAttachmentReads((count) => count - 1));
  };

  const handleSaveSketch = (dataUrl: string) => {
    setAttachments((prev) =>
      prev.length >= MAX_COMPOSER_ATTACHMENTS
        ? prev
        : [...prev, { id: `sketch-${Date.now()}`, name: `Sketch ${prev.length + 1}`, dataUrl }],
    );
  };

  const removeAttachment = (id: string) => {
    setBlockedAttachment(null);
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const resetAttachments = () => {
    setBlockedAttachment(null);
    setAttachments([]);
  };

  return {
    attachments,
    pendingAttachmentReads,
    blockedAttachment,
    attachMenuOpen,
    setAttachMenuOpen,
    isSketchOpen,
    setIsSketchOpen,
    fileInputRef,
    attachMenuRef,
    attachPanelRef,
    handleAttachFiles,
    addAttachmentFromUrl,
    handleSaveSketch,
    removeAttachment,
    resetAttachments,
  };
}

export type ComposerAttachmentsApi = ReturnType<typeof useComposerAttachments>;

// Pulls a same-origin image into a data URL for the composer.
export async function fetchImageAsDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'include', ...(signal ? { signal } : {}) });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
