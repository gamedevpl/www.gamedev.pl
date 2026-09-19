import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { gamePageHandle, type CatalogEntry } from './catalog.js';
import type { User } from './AuthContext.js';
import { gamePath, playPath, type AppRoute } from './core/router.js';
import { createPartySession, type PartySession } from './surfaces/party/mpApi.js';
import type { PlayVia } from './visitTelemetry.js';
import type { CatalogStatus } from './useCatalogData.js';
import type { Navigate } from './useAppNavigation.js';

export type StageContent =
  | {
      type: 'catalog';
      game: CatalogEntry;
      initialRemixOpen?: boolean;
      initialRemixRequest?: string;
      // Which home page surface launched this play, if it did.
      via?: PlayVia;
    }
  | { type: 'party'; game: CatalogEntry; session: PartySession; via?: PlayVia };

export type UseGameTheaterOptions = {
  route: AppRoute;
  catalogEntries: CatalogEntry[];
  catalogStatus: CatalogStatus;
  user: User | null;
  navigate: Navigate;
  exitOverlay?: (fallbackPath?: string) => void;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  setRecommendationsRefreshKey: Dispatch<SetStateAction<number>>;
};

export type UseGameTheaterResult = {
  stageContent: StageContent | null;
  partyError: string | null;
  handlePlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  handleRemixGame: (game: CatalogEntry, initialRemixRequest?: string) => void;
  handleExitCatalogTheater: () => void;
  handleExitPartyTheater: () => void;
  handlePlayTogether: (game: CatalogEntry, via?: PlayVia) => Promise<void>;
};

// What is on stage, how it got there, and how it leaves.
export function useGameTheater({
  route,
  catalogEntries,
  catalogStatus,
  user,
  navigate,
  exitOverlay,
  setIsAuthModalOpen,
  setRecommendationsRefreshKey,
}: UseGameTheaterOptions): UseGameTheaterResult {
  const { t } = useTranslation();
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  const [partyError, setPartyError] = useState<string | null>(null);

  // The fixed overlay is the only scrollable surface while a game runs.
  useEffect(() => {
    if (!stageContent) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [stageContent]);

  // `/play/<slug>` auto-opens theater once the catalog confirms the game.
  useEffect(() => {
    if (stageContent?.type === 'catalog') {
      if (route.view !== 'play' && route.view !== 'game') {
        setStageContent(null);
        return;
      }
      if (stageContent.game.slug !== route.slug) {
        if (route.view === 'play') {
          const nextEntry = catalogEntries.find((game) => game.slug === route.slug);
          if (catalogStatus === 'ready' && !nextEntry) {
            setStageContent(null);
          } else if (nextEntry) {
            setStageContent({ type: 'catalog', game: nextEntry });
          }
        } else {
          setStageContent(null);
        }
        return;
      }
      const entry = catalogEntries.find((game) => game.slug === stageContent.game.slug);
      if (entry && stageContent.game !== entry) {
        setStageContent((prev) =>
          prev?.type === 'catalog' && prev.game.slug === entry.slug ? { ...prev, game: entry } : prev,
        );
      }
      if (catalogStatus === 'ready' && !entry) {
        setStageContent(null);
      }
      return;
    }

    if (route.view !== 'play' || window.parent !== window) return;
    const entry = catalogEntries.find((game) => game.slug === route.slug);
    // Wait so unknown slugs do not flash a 404 theater.
    if (catalogStatus !== 'ready' || !entry) return;

    setStageContent({ type: 'catalog', game: entry });
  }, [route, catalogEntries, catalogStatus, stageContent]);

  // A sandboxed game's progress is lost to a stray Cmd-R.
  useEffect(() => {
    if (!stageContent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stageContent]);

  function handlePlayGame(game: CatalogEntry, via?: PlayVia) {
    const fullEntry = catalogEntries.find((e) => e.slug === game.slug) ?? game;
    setStageContent({ type: 'catalog', game: fullEntry, ...(via === undefined ? {} : { via }) });
    if (route.view !== 'game') {
      navigate(playPath(game.slug));
    }
    // Soft refresh so "continue" / genre picks update after the next home visit.
    setRecommendationsRefreshKey((n) => n + 1);
  }

  // The remix sheet opens on the first frame, no theater detour.
  function handleRemixGame(game: CatalogEntry, initialRemixRequest?: string) {
    setStageContent({ type: 'catalog', game, initialRemixOpen: true, initialRemixRequest });
    if (route.view !== 'game') {
      navigate(playPath(game.slug));
    }
  }

  function handleExitCatalogTheater() {
    if (stageContent?.type === 'catalog') {
      const game = stageContent.game;
      const canonical = gamePath(gamePageHandle(game), game.slug);
      if (exitOverlay) {
        exitOverlay(canonical);
      } else {
        navigate(canonical, { replace: true });
      }
      setStageContent(null);
      return;
    }
    setStageContent(null);
  }

  function handleExitPartyTheater() {
    if (stageContent?.type === 'party') {
      const game = stageContent.game;
      const canonical = gamePath(gamePageHandle(game), game.slug);
      if (exitOverlay) {
        exitOverlay(canonical);
      } else {
        navigate(canonical, { replace: true });
      }
      setStageContent(null);
      return;
    }
    setStageContent(null);
  }

  async function handlePlayTogether(game: CatalogEntry, via?: PlayVia) {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!game.multiplayer) return;

    setPartyError(null);
    try {
      const session = await createPartySession(game.slug, game.multiplayer.maxPlayers);
      setStageContent({ type: 'party', game, session, ...(via === undefined ? {} : { via }) });
      document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  return {
    stageContent,
    partyError,
    handlePlayGame,
    handleRemixGame,
    handleExitCatalogTheater,
    handleExitPartyTheater,
    handlePlayTogether,
  };
}
