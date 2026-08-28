import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AccountSettingsModal } from './AccountSettingsModal.js';
import { AuthModal } from './AuthModal.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { Mascot } from './Mascot.js';
import { NotificationBell } from './NotificationBell.js';
import { PixelIcon } from './PixelIcon.js';
import { fetchAdminSummary } from './surfaces/admin/adminApi.js';
import { fetchReviewStatus } from './reviewApi.js';
import { creatorPath } from './router.js';
import { usePageScrolling } from './usePageScrolling.js';

type NavHeaderProps = {
  /** Builds currently in flight for the signed-in creator. Server-derived, not a local tally. */
  activeBuildCount: number;
  /** In-app home navigation (avoids a full reload / beforeunload while a game is open). */
  onHome: () => void;
  /** Opens the creator control panel. */
  onStudio: () => void;
  /** Opens the operator console. Only ever called from a link only operators are shown. */
  onAdmin: () => void;
  onReview: () => void;
  // The creation landing page — a real destination, same as Studio.
  onCreate: () => void;
  // Highlights the Create Game item when already on /create.
  isOnCreate?: boolean;
  // Highlights the Studio item when already there.
  isOnStudio?: boolean;
  // Scrolls to the curated picks on home; navigates home first if elsewhere.
  onPlay: () => void;
  // Opens the /party destination — a real page, same as Studio and Create.
  onParty: () => void;
  // Highlights the Party item when already on /party.
  isOnParty?: boolean;
  /**
   * Android-style Up target for non-home surfaces. Null on home, join, play, and
   * while an immersive theater owns escape. Never history.back() — deep links
   * still land on a real parent.
   */
  upTarget?: { path: string; ariaLabel: string } | null;
  onUp?: (path: string) => void;
};

export function NavHeader({
  activeBuildCount,
  onHome,
  onStudio,
  onAdmin,
  onReview,
  onCreate,
  isOnCreate = false,
  isOnStudio = false,
  onPlay,
  onParty,
  isOnParty = false,
  upTarget = null,
  onUp,
}: NavHeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  // Header mark mimes the visitor: pull a phone and scroll a tiny feed while the page moves.
  const pageScrolling = usePageScrolling();
  /**
   * How many jobs are waiting on this person. Only ever read for an operator.
   *
   * Whether someone *is* one comes from the session (`user.admin`) rather than from
   * probing an operator endpoint and reading its 404 as "no". That probe was the
   * obvious implementation and the wrong one: it asked a settled question on every page
   * load, and for everybody who is not an operator — which is everybody — it answered
   * with an error in the browser console. The deploy gate that fails on console errors
   * caught it, correctly.
   */
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [reviewRemaining, setReviewRemaining] = useState<number | null>(null);
  const isOperator = user?.admin === true;
  const isReviewer = user?.reviewer === true || isOperator;

  useEffect(() => {
    if (!isOperator) {
      setAlertCount(null);
      return;
    }
    let cancelled = false;
    const read = () =>
      fetchAdminSummary()
        .then((summary) => {
          if (!cancelled) setAlertCount(summary ? summary.alerts.length : 0);
        })
        .catch(() => {
          // A failed read is not evidence of anything; leave the badge as it was.
        });
    void read();
    // Slower than the console's own poll: this is a badge somebody glances at, not a
    // queue they are working, and it rides along on every page of the site.
    const timer = setInterval(read, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOperator]);

  useEffect(() => {
    if (!isReviewer) {
      setReviewRemaining(null);
      return;
    }
    let cancelled = false;
    const read = () =>
      fetchReviewStatus()
        .then((status) => {
          if (!cancelled) setReviewRemaining(status ? status.remaining : 0);
        })
        .catch(() => {
          // Leave the last known badge; a transient miss is not "zero left".
        });
    void read();
    const timer = setInterval(read, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isReviewer]);

  // No backdrop of its own — only another nav click closed it.
  useEffect(() => {
    if (!isMenuOpen) return;
    const closeIfOutside = (event: Event) => {
      if (menuContainerRef.current?.contains(event.target as Node)) return;
      setIsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const handleLogoClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Preserve modified clicks (new tab / new window) and non-primary buttons.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
  };

  const openAccountSettings = () => {
    setIsMenuOpen(false);
    setIsAccountSettingsOpen(true);
  };

  return (
    <header className="app-header">
      <div className="logo-brand">
        {upTarget && onUp ? (
          <button
            type="button"
            className="nav-up"
            aria-label={upTarget.ariaLabel}
            title={upTarget.ariaLabel}
            onClick={() => onUp(upTarget.path)}
          >
            <PixelIcon name="arrowLeft" size={16} />
          </button>
        ) : null}
        <a href="/" className="logo" onClick={handleLogoClick}>
          <Mascot
            className="mascot--logo"
            emotion="idle"
            size={35}
            title={t('header.logoAlt')}
            scrolling={pageScrolling}
          />
          gamedev<span className="turquoise">.pl</span>
        </a>
      </div>

      <nav className="header-nav">
        <button type="button" className="header-nav-link" onClick={onPlay}>
          {t('header.navPlay')}
        </button>
        <button type="button" className={`header-nav-link${isOnCreate ? ' is-active' : ''}`} onClick={onCreate}>
          {t('header.navCreate')}
        </button>
        <button
          type="button"
          className={`header-nav-link${isOnStudio ? ' is-active' : ''}`}
          onClick={onStudio}
          aria-label={
            activeBuildCount > 0
              ? `${t('header.navStudio')} — ${t('myGames.liveCount', { count: activeBuildCount })}`
              : undefined
          }
        >
          {t('header.navStudio')}
          {activeBuildCount > 0 ? (
            <span className="specs-count-badge" aria-hidden="true">
              {activeBuildCount}
            </span>
          ) : null}
        </button>
        <button type="button" className={`header-nav-link${isOnParty ? ' is-active' : ''}`} onClick={onParty}>
          {t('header.navParty')}
        </button>
      </nav>

      <div className="header-actions">
        {user ? (
          <div className="user-profile-badge">
            {/* Avatar opens account settings so deletion stays reachable after the
                menu item was removed — especially for creators who have not claimed
                a handle yet (Edit Profile is not available to them). */}
            <button
              type="button"
              className="user-avatar-btn"
              onClick={openAccountSettings}
              aria-label={t('creatorProfile.accountSettings')}
              title={t('creatorProfile.accountSettings')}
            >
              {user.picture ? (
                <img src={user.picture} alt="" className="user-avatar" width="24" height="24" />
              ) : (
                <span className="user-avatar-placeholder">
                  <PixelIcon name="user" size={16} />
                </span>
              )}
            </button>
            {user.handle ? (
              <a className="user-name user-name--profile" href={creatorPath(user.handle)}>
                {user.profileName || `@${user.handle}`}
              </a>
            ) : (
              <button type="button" className="user-name user-name--settings" onClick={openAccountSettings}>
                {user.name || user.email || 'User'}
              </button>
            )}
            <NotificationBell />
          </div>
        ) : (
          <button className="sign-in-btn" onClick={() => setIsAuthModalOpen(true)}>
            {t('header.signIn')}
          </button>
        )}

        <LanguageSwitcher />

        <div ref={menuContainerRef} className={`hamburger-container${isMenuOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="hamburger-btn"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={
              activeBuildCount > 0
                ? `Menu — ${t('header.activeBuilds', { count: activeBuildCount })}`
                : 'Toggle Navigation Menu'
            }
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <PixelIcon name="menu" size={16} />
            {activeBuildCount > 0 && !isMenuOpen ? (
              <span className="hamburger-live-badge" aria-hidden="true">
                {activeBuildCount > 99 ? '99+' : activeBuildCount}
              </span>
            ) : null}
          </button>

          {isMenuOpen && (
            <nav className="dropdown-menu">
              {/* Mirrors the flat nav — hidden by CSS once that row is visible (1100px+),
                  so this is purely the narrow-width fallback, not a permanent duplicate. */}
              <button
                className="nav-link nav-link--flat-mirror"
                onClick={() => {
                  setIsMenuOpen(false);
                  onPlay();
                }}
              >
                <PixelIcon name="play" size={14} /> {t('header.navPlay')}
              </button>
              <button
                className={`nav-link nav-link--flat-mirror${isOnCreate ? ' is-active' : ''}`}
                onClick={() => {
                  setIsMenuOpen(false);
                  onCreate();
                }}
              >
                <PixelIcon name="sparkle" size={14} /> {t('header.navPrompt')}
              </button>
              <button
                className={`nav-link nav-link--flat-mirror${isOnStudio ? ' is-active' : ''}`}
                onClick={() => {
                  setIsMenuOpen(false);
                  onStudio();
                }}
              >
                <PixelIcon name="wrench" size={14} /> {t('header.navStudio')}
                {activeBuildCount > 0 ? (
                  <span
                    className="specs-count-badge"
                    aria-label={t('header.activeBuilds', { count: activeBuildCount })}
                  >
                    {activeBuildCount}
                  </span>
                ) : null}
              </button>
              <button
                className={`nav-link nav-link--flat-mirror${isOnParty ? ' is-active' : ''}`}
                onClick={() => {
                  setIsMenuOpen(false);
                  onParty();
                }}
              >
                <PixelIcon name="phone" size={14} /> {t('header.navParty')}
              </button>

              {/* Operators only — everyone else never learns this exists, which is the
                  same posture the API takes when asked. */}
              {isOperator ? (
                <button
                  className="nav-link"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onAdmin();
                  }}
                >
                  <PixelIcon name="wrench" size={14} /> Operator
                  {alertCount !== null && alertCount > 0 ? (
                    <span className="specs-count-badge" aria-label={`${alertCount} waiting on you`}>
                      {alertCount}
                    </span>
                  ) : null}
                </button>
              ) : null}

              {isReviewer ? (
                <button
                  className="nav-link"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onReview();
                  }}
                >
                  <PixelIcon name="star" size={14} /> Review
                  {reviewRemaining !== null && reviewRemaining > 0 ? (
                    <span className="specs-count-badge" aria-label={`${reviewRemaining} games to review`}>
                      {reviewRemaining}
                    </span>
                  ) : null}
                </button>
              ) : null}

              {/* Sign out lives at the foot of the menu on every width — not beside
                  the avatar, where it competed with the bell and the menu button. */}
              {user ? (
                <button
                  className="nav-link nav-link--sign-out"
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                >
                  <PixelIcon name="user" size={14} /> {t('header.signOut')}
                </button>
              ) : null}

              {/* Language lives in the header bar on a desktop. On a phone it
                  cannot fit beside the avatar, so this group reveals it instead. */}
              <div className="menu-extras">
                <LanguageSwitcher />
              </div>
            </nav>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <AccountSettingsModal isOpen={isAccountSettingsOpen} onClose={() => setIsAccountSettingsOpen(false)} />
    </header>
  );
}
