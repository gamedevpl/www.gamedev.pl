import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PixelIcon } from '../../web/src/PixelIcon.js';

type CodeView = 'panel' | 'editor' | 'editor-chat' | 'editor-chat-preview' | 'editor-preview';

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
  const toggleChat = () =>
    chooseView(
      view.startsWith('editor-chat')
        ? view.endsWith('preview')
          ? 'editor-preview'
          : 'editor'
        : view.endsWith('preview')
          ? 'editor-chat-preview'
          : 'editor-chat',
    );
  const togglePreview = () =>
    chooseView(
      view.endsWith('preview')
        ? view.startsWith('editor-chat')
          ? 'editor-chat'
          : 'editor'
        : view.startsWith('editor-chat')
          ? 'editor-chat-preview'
          : 'editor-preview',
    );

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
        setView(view.endsWith('preview') ? 'editor-preview' : 'editor');
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

  return { open, view, close, chooseView, restore, toggleChat, togglePreview };
}

export function CodePanelViewControls({
  view,
  chooseView,
  restore,
  close,
  toggleChat,
  togglePreview,
}: Omit<ReturnType<typeof useCodePanelView>, 'open'>) {
  const maximized = view === 'editor';
  return (
    <div className="code-panel-actions">
      <button
        aria-label="Toggle conversation beside Code"
        title="Conversation"
        aria-pressed={view.startsWith('editor-chat')}
        onClick={toggleChat}
      >
        <PixelIcon name="chat" size={16} />
      </button>
      <button
        aria-label="Toggle game preview beside Code"
        title="Game preview"
        aria-pressed={view.endsWith('preview')}
        onClick={togglePreview}
      >
        <PixelIcon name="gamepad" size={16} />
      </button>
      <button
        aria-label={view === 'panel' ? 'Dock Code panel' : 'Float Code panel'}
        title={view === 'panel' ? 'Dock Code panel' : 'Float Code panel'}
        onClick={() => chooseView(view === 'panel' ? 'editor-chat-preview' : 'panel')}
      >
        <PixelIcon name="panel" size={16} />
      </button>
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
