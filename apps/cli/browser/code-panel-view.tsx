import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PixelIcon } from '../../web/src/PixelIcon.js';

type CodeView = 'panel' | 'editor' | 'editor-chat' | 'editor-chat-preview';

export function useCodePanelView() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CodeView>('panel');
  const previous = useRef<CodeView>('panel');
  const openingChat = useRef(false);
  const close = () => {
    setView('panel');
    setOpen(false);
  };
  const chooseView = (next: CodeView | 'game') => {
    if (next === 'game') {
      document.getElementById('clean')?.click();
      return;
    }
    if (next.startsWith('editor-chat')) {
      openingChat.current = true;
      flushSync(() => setView(next));
      document.getElementById('edit')?.click();
      openingChat.current = false;
      return;
    }
    if (next === 'editor' && view !== 'editor') previous.current = view;
    setView(next);
  };
  const restore = () => setView(previous.current);

  useEffect(() => {
    const button = document.getElementById('code-open');
    const show = () => {
      document.exitPointerLock?.();
      setView('panel');
      setOpen((value) => !value);
    };
    const otherPanel = () => {
      if (openingChat.current) return;
      // The host focuses the newly opened panel immediately after this event.
      flushSync(() => {
        setView('panel');
        if (innerWidth <= 1000) setOpen(false);
      });
    };
    const closeChat = () => {
      if (view.startsWith('editor-chat')) {
        previous.current = 'panel';
        setView('editor');
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (view !== 'panel') {
        setView(view === 'editor' ? previous.current : 'panel');
        event.preventDefault();
      } else if (!(event.target instanceof Element && event.target.closest('.cm-editor'))) {
        setOpen(false);
      }
    };
    button?.addEventListener('click', show);
    window.addEventListener('play-open-panel', otherPanel);
    document.getElementById('clean')?.addEventListener('click', close);
    window.addEventListener('play-close-conversation', closeChat);
    window.addEventListener('keydown', escape);
    return () => {
      button?.removeEventListener('click', show);
      window.removeEventListener('play-open-panel', otherPanel);
      document.getElementById('clean')?.removeEventListener('click', close);
      window.removeEventListener('play-close-conversation', closeChat);
      window.removeEventListener('keydown', escape);
    };
  }, [view]);

  return { open, view, close, chooseView, restore };
}

export function CodePanelViewControls({
  view,
  chooseView,
  restore,
  close,
}: Omit<ReturnType<typeof useCodePanelView>, 'open'>) {
  const maximized = view === 'editor';
  return (
    <div className="code-panel-actions">
      <select
        aria-label="Code view"
        value={view}
        onChange={(event) => chooseView(event.target.value as CodeView | 'game')}
      >
        <option value="panel">Floating panel</option>
        <option value="editor">Editor only</option>
        <option value="editor-chat">Editor + chat</option>
        <option value="editor-chat-preview">Editor + chat + preview</option>
        <option value="game">Game only · hide controls</option>
      </select>
      <button
        id="code-maximize"
        aria-label={maximized ? 'Restore Code panel' : 'Maximize Code editor'}
        title={maximized ? 'Restore Code panel' : 'Maximize Code editor'}
        aria-pressed={maximized}
        onClick={() => (maximized ? restore() : chooseView('editor'))}
      >
        <PixelIcon name={maximized ? 'collapse' : 'expand'} size={16} />
      </button>
      <button aria-label="Close Code" onClick={close}>
        <PixelIcon name="close" size={16} />
      </button>
    </div>
  );
}
