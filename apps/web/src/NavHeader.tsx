import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { Mascot } from './Mascot.js';
import { NotificationBell } from './NotificationBell.js';
import { PixelIcon } from './PixelIcon.js';
import { fetchAdminSummary } from './adminApi.js';
import { usePageScrolling } from './usePageScrolling.js';
import githubIcon from './assets/github-mark-white.svg';

type NavHeaderProps = {
  /** Builds currently in flight for the signed-in creator. Server-derived, not a local tally. */
  activeBuildCount: number;
  onNavigate: (sectionId: string) => void;
  /** In-app home navigation (avoids a full reload / beforeunload while a game is open). */
  onHome: () => void;
  /** Opens the creator control panel. */
  onStudio: () => void;
  /** Opens the operator console. Only ever called from a link only operators are shown. */
  onAdmin: () => void;
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
  onNavigate,
  onHome,
  onStudio,
  onAdmin,
  upTarget = null,
  onUp,
}: NavHeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Header mark mimes the visitor: pull a phone and scroll a tiny feed while the page moves.
  const pageScrolling = usePageScrolling();
  /**
   * How many jobs are waiting on this person, or null when they are not an operator —
   * which is everyone. The console has been reachable only by knowing its URL, so the
   * one surface with something to *do* on it was the one nothing linked to.
   *
   * The summary endpoint is the admission test: it answers 404 to everybody else, so a
   * non-operator gets `null` and no link, and nothing here has to know why.
   */
  const [alertCount, setAlertCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setAlertCount(null);
      return;
    }
    let cancelled = false;
    const read = () =>
      fetchAdminSummary()
        .then((summary) => {
          if (cancelled) return;
          setAlertCount(summary ? summary.alerts.length : null);
          // Whether someone is an operator does not change while they browse, and
          // almost nobody is one. Polling on regardless would have every signed-in
          // visitor asking a question with a known answer, forever, at 404 apiece.
          if (!summary) clearInterval(timer);
        })
        .catch(() => {
          // A failed read is not evidence of anything; leave the link as it was and
          // keep the timer, since the next read may well succeed.
        });
    // Slower than the console's own poll: this is a badge somebody glances at, not a
    // queue they are working, and it rides along on every page of the site. Started
    // before the first read so that read can stop it — it only ever runs on a later
    // microtask, so the binding is always initialized by then.
    const timer = setInterval(read, 120_000);
    void read();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  const handleNavClick = (sectionId: string) => {
    onNavigate(sectionId);
    setIsMenuOpen(false);
  };

  const handleLogoClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Preserve modified clicks (new tab / new window) and non-primary buttons.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onHome();
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

      <div className="header-actions">
        {user ? (
          <div className="user-profile-badge">
            {user.picture ? (
              <img src={user.picture} alt="" className="user-avatar" width="24" height="24" />
            ) : (
              <span className="user-avatar-placeholder">
                <PixelIcon name="user" size={16} />
              </span>
            )}
            <span className="user-name">{user.name || user.email || 'User'}</span>
            <NotificationBell />
            <button className="logout-btn" onClick={logout} title={t('header.signOut')}>
              {t('header.signOut')}
            </button>
          </div>
        ) : (
          <button className="sign-in-btn" onClick={() => setIsAuthModalOpen(true)}>
            {t('header.signIn')}
          </button>
        )}

        <LanguageSwitcher />

        <a
          className="github"
          href="https://github.com/gamedevpl/www.gamedev.pl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('header.githubAria')}
        >
          <img src={githubIcon} alt="" width="20" height="20" />
        </a>

        <div className="hamburger-container">
          <button
            type="button"
            className="hamburger-btn"
            aria-expanded={isMenuOpen}
            aria-label="Toggle Navigation Menu"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            {isMenuOpen ? <PixelIcon name="close" size={16} /> : <PixelIcon name="menu" size={16} />}
          </button>

          {isMenuOpen && (
            <nav className="dropdown-menu">
              <button className="nav-link" onClick={() => handleNavClick('hero-prompt')}>
                <PixelIcon name="sparkle" size={14} /> {t('header.navPrompt')}
              </button>
              <button className="nav-link" onClick={() => handleNavClick('arcade')}>
                <PixelIcon name="gamepad" size={14} /> {t('header.navArcade')}
              </button>
              {/* Studio is the creator home. The home page only keeps a short
                  "your games" gist; the full shelf + build/playtest/improve loop
                  lives here. Always offered — unsigned visitors get the sign-in
                  prompt inside Studio rather than a dead "My Games" scroll target. */}
              <button
                className="nav-link"
                onClick={() => {
                  setIsMenuOpen(false);
                  onStudio();
                }}
              >
                <PixelIcon name="wrench" size={14} /> {t('header.navStudio')}
                {activeBuildCount > 0 && (
                  // The bare number reads as "Studio 2" to a screen reader; say what it counts.
                  <span
                    className="specs-count-badge"
                    aria-label={t('header.activeBuilds', { count: activeBuildCount })}
                  >
                    {activeBuildCount}
                  </span>
                )}
              </button>

              {/* Operators only — everyone else never learns this exists, which is the
                  same posture the API takes when asked. */}
              {alertCount !== null && (
                <button
                  className="nav-link"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onAdmin();
                  }}
                >
                  <PixelIcon name="wrench" size={14} /> Operator
                  {alertCount > 0 && (
                    <span className="specs-count-badge" aria-label={`${alertCount} waiting on you`}>
                      {alertCount}
                    </span>
                  )}
                </button>
              )}

              {/* Controls that live in the header bar on a desktop but cannot fit
                  beside it on a phone. Hidden above the mobile breakpoint, where
                  the header itself still shows them. */}
              <div className="menu-extras">
                {user && (
                  <button
                    className="nav-link"
                    onClick={() => {
                      setIsMenuOpen(false);
                      logout();
                    }}
                  >
                    <PixelIcon name="user" size={14} /> {t('header.signOut')}
                  </button>
                )}

                <a
                  className="nav-link"
                  href="https://github.com/gamedevpl/www.gamedev.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <img src={githubIcon} alt="" width="14" height="14" /> GitHub
                </a>

                <LanguageSwitcher />
              </div>
            </nav>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
}
