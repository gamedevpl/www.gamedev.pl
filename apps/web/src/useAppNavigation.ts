import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { readLocationRoute } from './appRouteRecovery.js';
import { connectPath, createPath, NAVIGATE_EVENT, partyPath, type AppRoute } from './core/router.js';

export type NavigateOptions = { replace?: boolean };
export type Navigate = (path: string, options?: NavigateOptions) => void;

export type UseAppNavigationOptions = {
  partySeedRef: MutableRefObject<string | null>;
  setPendingScrollTarget: Dispatch<SetStateAction<string | null>>;
};

export type UseAppNavigationResult = {
  route: AppRoute;
  navigate: Navigate;
  exitOverlay: () => void;
  handleCreateNav: () => void;
  handlePartyCreateNav: () => void;
  handlePartyNav: () => void;
  handleConnectNav: () => void;
  handleHomeAnchorNav: (anchorId: string) => void;
};

const HERO_PROMPT_INPUT = '#hero-prompt .big-prompt-input';

// Route state, and every way the app changes the URL.
export function useAppNavigation({
  partySeedRef,
  setPendingScrollTarget,
}: UseAppNavigationOptions): UseAppNavigationResult {
  const { t } = useTranslation();
  const [route, setRoute] = useState(() => readLocationRoute());

  useEffect(() => {
    // hashchange too: hybrid join URLs carry the credential in the fragment.
    const syncRoute = () => {
      setRoute(readLocationRoute());
    };

    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Where a /play overlay was opened from, so Close can return there.
  const playReturnPathRef = useRef<string | null>(null);

  const navigate = useCallback<Navigate>((path, options) => {
    // Record the opener so exitOverlay can return to it.
    if (path.startsWith('/play/') && !window.location.pathname.startsWith('/play/')) {
      playReturnPathRef.current = window.location.pathname + window.location.search;
    }

    // URL first, route synchronously — no waiting on popstate.
    if (options?.replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    // pushState is silent; announce it before the state update.
    window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path } }));
    setRoute(readLocationRoute());
  }, []);

  // Closing a URL-owning overlay returns to its opener, else home.
  const exitOverlay = useCallback(() => {
    const returnPath = playReturnPathRef.current;
    playReturnPathRef.current = null;
    if (returnPath && !returnPath.startsWith('/play/')) {
      navigate(returnPath);
      return;
    }
    navigate('/');
  }, [navigate]);

  // Deliberate click focuses even on phones, unlike page-load autofocus.
  function handleCreateNav() {
    flushSync(() => {
      navigate(createPath());
    });
    // A new page starts at the top, not the old offset.
    window.scrollTo(0, 0);
    const input = document.querySelector<HTMLTextAreaElement>(HERO_PROMPT_INPUT);
    input?.focus({ preventScroll: true });
  }

  // Same handoff as Create, concept pre-loaded with party framing.
  function handlePartyCreateNav() {
    partySeedRef.current = t('party.customStarterPrompt');
    flushSync(() => {
      navigate(createPath());
    });
    window.scrollTo(0, 0);
    const input = document.querySelector<HTMLTextAreaElement>(HERO_PROMPT_INPUT);
    if (input) {
      input.focus({ preventScroll: true });
      // Cursor at the end so typing continues the sentence, not overwrites it.
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // A real destination now, not a scroll to the home rail.
  function handlePartyNav() {
    navigate(partyPath());
    // A new page starts at the top, not mid-scroll.
    window.scrollTo(0, 0);
  }

  function handleConnectNav() {
    navigate(connectPath());
    window.scrollTo(0, 0);
  }

  // Off home, queue the anchor; the pending-scroll effect resolves it.
  function handleHomeAnchorNav(anchorId: string) {
    if (route.view === 'home') {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setPendingScrollTarget(anchorId);
    navigate('/');
  }

  return {
    route,
    navigate,
    exitOverlay,
    handleCreateNav,
    handlePartyCreateNav,
    handlePartyNav,
    handleConnectNav,
    handleHomeAnchorNav,
  };
}
