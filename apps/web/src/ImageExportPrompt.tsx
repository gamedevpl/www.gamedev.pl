import { useEffect, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FILE_EXPORT_ARM_MS, type FileExportPrompt } from './fileExport.js';
import { useImageExportBridge } from './imageExport.js';
import { useVideoExportBridge } from './videoExport.js';
import './image-export-prompt.css';

type FrameRef = MutableRefObject<HTMLIFrameElement | null>;

// Text only: the game's image data is never rendered here.
export function ImageExportPrompt({ frameRef }: { frameRef: FrameRef }) {
  return <ExportPromptCard prompt={useImageExportBridge(frameRef)} kind="image" />;
}

// Text only too: the clip is never played by the shell.
export function VideoExportPrompt({ frameRef }: { frameRef: FrameRef }) {
  return <ExportPromptCard prompt={useVideoExportBridge(frameRef)} kind="video" />;
}

// Photo and clip prompts for one game frame.
export function ExportPrompts({ frameRef }: { frameRef: FrameRef }) {
  return (
    <>
      <ImageExportPrompt frameRef={frameRef} />
      <VideoExportPrompt frameRef={frameRef} />
    </>
  );
}

function ExportPromptCard({ prompt, kind }: { prompt: FileExportPrompt | null; kind: 'image' | 'video' }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const filename = prompt?.filename ?? null;

  // Fullscreen shows only its own subtree, so the prompt must live there.
  const [host, setHost] = useState<Element>(() => fullscreenHost());
  useEffect(() => {
    const onChange = () => setHost(fullscreenHost());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    setArmed(false);
    if (filename === null) return;
    const timer = setTimeout(() => setArmed(true), FILE_EXPORT_ARM_MS);
    return () => clearTimeout(timer);
  }, [filename]);

  if (!prompt) return null;
  // Portaled so no Studio sheet or stacking context can cover it.
  return createPortal(
    <div className="image-export-prompt" role="alertdialog" aria-live="polite" aria-label={t('imageExport.save')}>
      <p className="image-export-prompt__text">
        {kind === 'video'
          ? t('imageExport.videoPrompt', { filename: prompt.filename })
          : t('imageExport.prompt', { filename: prompt.filename })}
      </p>
      <div className="image-export-prompt__actions">
        <button type="button" className="image-export-prompt__save" disabled={!armed} onClick={prompt.save}>
          {t('imageExport.save')}
        </button>
        <button type="button" className="image-export-prompt__dismiss" onClick={prompt.dismiss}>
          {t('imageExport.notNow')}
        </button>
      </div>
    </div>,
    host,
  );
}

function fullscreenHost(): Element {
  const full = document.fullscreenElement;
  return full && full.tagName !== 'IFRAME' ? full : document.body;
}
