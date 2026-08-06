import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AccountSettingsModal } from './AccountSettingsModal.js';
import { AuthModal } from './AuthModal.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { Mascot } from './Mascot.js';
import { NotificationBell } from './NotificationBell.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath } from './router.js';
import { usePageScrolling } from './usePageScrolling.js';

type NavHeaderProps = {
  /** Builds currently in flight for the signed-in creator. Server-derived, not a local tally. */
  activeBuildCount: number;
  onNavigate: (sectionId: string) => void;
  /** In-app home navigation (avoids a full reload / beforeunload while a game is open). */
  onHome: () => void;
  /** Opens the creator control panel. */
  onStudio: () => void;
  /**
   * Android-style Up target for non-home surfaces. Null on home, join, play, and
   * while an immersive theater owns escape. Never history.back() — deep links
   * still land on a real parent.
   */
  upTarget?: { path: string; ariaLabel: string } | null;
  onUp?: (path: string) => void;
};

export function NavHeader({ activeBuildCount, onNavigate, onHome, onStudio, upTarget = null, onUp }: NavHeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Header mark mimes the visitor: pull a phone and scroll a tiny feed while the page moves.
  const pageScrolling = usePageScrolling();

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
            <button className="logout-btn" onClick={logout} title={t('header.signOut')}>
              {t('header.signOut')}
            </button>
          </div>
        ) : (
          <button className="sign-in-btn" onClick={() => setIsAuthModalOpen(true)}>
            {t('header.signIn')}
          </button>
        )}

        {/* Rich Studio chip — desktop only. On a phone the hamburger already lists
            Studio next to Create Game; the live count rides on that menu row (and a
            small badge on the menu button) so the header stays logo · session · menu. */}
        <button
          type="button"
          className={`studio-chip${activeBuildCount > 0 ? ' is-live' : ''}`}
          onClick={onStudio}
          aria-label={
            activeBuildCount > 0
              ? `${t('myGames.liveCount', { count: activeBuildCount })} — ${t('myGames.openStudio')}`
              : t('myGames.openStudio')
          }
        >
          {activeBuildCount > 0 ? (
            <>
              <span className="live-dot" aria-hidden="true" />
              <span className="studio-chip-count">{t('myGames.liveCount', { count: activeBuildCount })}</span>
            </>
          ) : null}
          <PixelIcon name="wrench" size={12} />
          <span className="studio-chip-label">{t('myGames.openStudio')}</span>
        </button>

        <LanguageSwitcher />

        <div className="hamburger-container">
          <button
            type="button"
            className="hamburger-btn"
            aria-expanded={isMenuOpen}
            aria-label={
              activeBuildCount > 0
                ? `Menu — ${t('header.activeBuilds', { count: activeBuildCount })}`
                : 'Toggle Navigation Menu'
            }
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            {isMenuOpen ? <PixelIcon name="close" size={16} /> : <PixelIcon name="menu" size={16} />}
            {activeBuildCount > 0 && !isMenuOpen ? (
              <span className="hamburger-live-badge" aria-hidden="true">
                {activeBuildCount > 99 ? '99+' : activeBuildCount}
              </span>
            ) : null}
          </button>

          {isMenuOpen && (
            <nav className="dropdown-menu">
              <button className="nav-link" onClick={() => handleNavClick('hero-prompt')}>
                <PixelIcon name="sparkle" size={14} /> {t('header.navPrompt')}
              </button>
              <button
                className="nav-link"
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
