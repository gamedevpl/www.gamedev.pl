import { useEffect, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IMAGE_EXPORT_ARM_MS, useImageExportBridge } from './imageExport.js';
import './image-export-prompt.css';

// Text only: the game's image data is never rendered here.
export function ImageExportPrompt({ frameRef }: { frameRef: MutableRefObject<HTMLIFrameElement | null> }) {
  const { t } = useTranslation();
  const prompt = useImageExportBridge(frameRef);
  const [armed, setArmed] = useState(false);
  const filename = prompt?.filename ?? null;

  useEffect(() => {
    setArmed(false);
    if (filename === null) return;
    const timer = setTimeout(() => setArmed(true), IMAGE_EXPORT_ARM_MS);
    return () => clearTimeout(timer);
  }, [filename]);

  if (!prompt) return null;
  // Portaled so no Studio sheet or stacking context can cover it.
  return createPortal(
    <div className="image-export-prompt" role="alertdialog" aria-live="polite" aria-label={t('imageExport.save')}>
      <p className="image-export-prompt__text">{t('imageExport.prompt', { filename: prompt.filename })}</p>
      <div className="image-export-prompt__actions">
        <button type="button" className="image-export-prompt__save" disabled={!armed} onClick={prompt.save}>
          {t('imageExport.save')}
        </button>
        <button type="button" className="image-export-prompt__dismiss" onClick={prompt.dismiss}>
          {t('imageExport.notNow')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
