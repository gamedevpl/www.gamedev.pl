import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { Mascot } from './Mascot.js';
import { NAVIGATE_EVENT, parsePathRoute, type AppRoute } from './core/router.js';
import './site-assistant.css';

// The mascot as a site assistant: a corner button opening a chat.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Loaded on first open, so the chat costs the shell nothing.
const SiteAssistantChat = lazy(() =>
  import('./SiteAssistantChat.js').then((module) => ({ default: module.SiteAssistantChat })),
);

// Browsing pages only: never Studio, creation or a game being played.
const VIEWS: ReadonlySet<AppRoute['view']> = new Set(['home', 'game', 'creator', 'connect', 'proposals']);

// Bottom bars that sit above everything; the mascot moves over them.
const BOTTOM_BARS = '.install-prompt, .app-update';

function bottomBarHeight(): number {
  const bar = document.querySelector(BOTTOM_BARS);
  return bar ? Math.ceil(bar.getBoundingClientRect().height) + 12 : 0;
}

// Tracks a bar appearing, leaving or wrapping to another height.
function useBottomBarLift(active: boolean): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setLift(bottomBarHeight());
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };
    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active]);
  return active ? lift : 0;
}

function currentView(): AppRoute['view'] {
  return parsePathRoute(window.location.pathname, window.location.hash).view;
}

// Whether the server offers the assistant to this signed-in visitor.
async function siteAssistantOffered(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/assistant/info`, { credentials: 'same-origin' });
    return response.ok;
  } catch {
    return false;
  }
}

export function SiteAssistant() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [view, setView] = useState(currentView);
  const [offered, setOffered] = useState(false);
  const [open, setOpen] = useState(false);
  // Stays mounted once opened, so closing keeps the conversation.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const update = () => setView(currentView());
    window.addEventListener('popstate', update);
    window.addEventListener(NAVIGATE_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAVIGATE_EVENT, update);
    };
  }, []);

  useEffect(() => {
    setOffered(false);
    setOpen(false);
    setLoaded(false);
    if (!uid) return;
    let live = true;
    void siteAssistantOffered().then((answer) => {
      if (live) setOffered(answer);
    });
    return () => {
      live = false;
    };
  }, [uid]);

  const shown = Boolean(uid) && offered && VIEWS.has(view);
  const lift = useBottomBarLift(shown);
  if (!shown) return null;

  return (
    <aside
      className={`site-assistant${open ? ' is-open' : ''}`}
      aria-label={t('siteAssistant.label')}
      style={lift ? ({ '--site-assistant-lift': `${lift}px` } as CSSProperties) : undefined}
    >
      {loaded ? (
        <div className="site-assistant-panel" hidden={!open}>
          <Suspense fallback={<p className="site-assistant-loading">{t('siteAssistant.loading')}</p>}>
            <SiteAssistantChat key={uid ?? ''} />
          </Suspense>
        </div>
      ) : null}
      <button
        type="button"
        className="site-assistant-launcher"
        aria-expanded={open}
        aria-label={open ? t('siteAssistant.close') : t('siteAssistant.open')}
        title={open ? t('siteAssistant.close') : t('siteAssistant.open')}
        onClick={() => {
          setLoaded(true);
          setOpen((was) => !was);
        }}
      >
        <Mascot emotion={open ? 'happy' : 'curious'} size={40} />
      </button>
    </aside>
  );
}
