import { useEffect, useRef, useState } from 'react';
import { useClampToViewport } from '../../useClampToViewport.js';

export type ComposerAttachment = { id: string; name: string; dataUrl: string };

export const MAX_COMPOSER_ATTACHMENTS = 4;

// Attachment state: uploads and sketches, capped at MAX_COMPOSER_ATTACHMENTS.
export function useComposerAttachments(sending: boolean) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // FileReader work not yet landed in attachments — Send waits for it.
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
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

  const handleSaveSketch = (dataUrl: string) => {
    setAttachments((prev) =>
      prev.length >= MAX_COMPOSER_ATTACHMENTS
        ? prev
        : [...prev, { id: `sketch-${Date.now()}`, name: `Sketch ${prev.length + 1}`, dataUrl }],
    );
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const resetAttachments = () => setAttachments([]);

  return {
    attachments,
    pendingAttachmentReads,
    attachMenuOpen,
    setAttachMenuOpen,
    isSketchOpen,
    setIsSketchOpen,
    fileInputRef,
    attachMenuRef,
    attachPanelRef,
    handleAttachFiles,
    handleSaveSketch,
    removeAttachment,
    resetAttachments,
  };
}

export type ComposerAttachmentsApi = ReturnType<typeof useComposerAttachments>;
