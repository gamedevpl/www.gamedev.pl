import { installResizeHandle, storedSize } from 'genaicode/react';

export function initializeWorkbenchResize() {
  const element = (id: string) => document.getElementById(id)!;
  const body = document.body;
  const code = element('code-panel');
  const focused = () => !code.hidden && code.dataset.view?.startsWith('editor');
  const height = () =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--height')) || innerHeight;
  const widthBounds = (): [number, number] => {
    const max = focused()
      ? Math.min(900, innerWidth * 0.6, innerWidth - 320)
      : Math.min(900, innerWidth - 24, body.dataset.codeOpen === 'true' ? innerWidth * 0.5 - 24 : Infinity);
    return [Math.min(300, max), Math.max(0, max)];
  };
  const bind = (
    id: string,
    key: string,
    variable: string,
    defaults: () => number,
    {
      storageBounds,
      ...config
    }: {
      axis: 'x' | 'y';
      direction: () => number;
      bounds: () => [number, number];
      storageBounds: [number, number];
    },
  ) => {
    const stored = storedSize(key, storageBounds);
    let saved = stored.get();
    if (saved !== undefined) body.style.setProperty(variable, `${saved}px`);
    return installResizeHandle(element(id), {
      ...config,
      read: () => saved ?? defaults(),
      write: (value, save) => {
        saved = value;
        body.style.setProperty(variable, `${value}px`);
        if (save) stored.set(value);
      },
      reset: () => {
        saved = undefined;
        body.style.removeProperty(variable);
        stored.clear();
      },
    }).sync;
  };
  const syncs = [
    bind(
      'panel-resize',
      'play-panel-width',
      '--panel-width',
      () => (focused() ? Math.min(390, innerWidth * 0.45) : 390),
      {
        axis: 'x',
        direction: () => (body.dataset.dock === 'left' && code.dataset.view !== 'editor-preview' ? 1 : -1),
        bounds: widthBounds,
        storageBounds: [300, 900],
      },
    ),
    bind(
      'code-preview-resize',
      'play-preview-height',
      '--play-preview-height',
      () => Math.min(innerHeight * 0.32, 260),
      {
        axis: 'y',
        direction: () => -1,
        bounds: () => [64, Math.max(64, height() - 280)],
        storageBounds: [64, 10_000],
      },
    ),
    bind(
      'code-files-resize',
      'play-files-width',
      '--play-files-width',
      () => Math.min(240, element('code-workspace').clientWidth * 0.36 || 240),
      {
        axis: 'x',
        direction: () => 1,
        storageBounds: [140, 480],
        bounds: () => {
          const max = Math.min(480, element('code-workspace').clientWidth - 186);
          return [Math.min(140, Math.max(0, max)), Math.max(0, max)];
        },
      },
    ),
  ];
  const sync = () => syncs.forEach((update) => update());
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  const observer = new MutationObserver(sync);
  observer.observe(body, { attributes: true, attributeFilter: ['data-dock', 'data-code-open', 'style'] });
  observer.observe(code, { attributes: true, attributeFilter: ['hidden', 'data-view', 'data-files-open'] });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(element('code-workspace'));
}
