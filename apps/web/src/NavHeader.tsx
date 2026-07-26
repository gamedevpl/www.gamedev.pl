import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { Mascot } from './Mascot.js';
import { NotificationBell } from './NotificationBell.js';
import { PixelIcon } from './PixelIcon.js';
import githubIcon from './assets/github-mark-white.svg';

type NavHeaderProps = {
  activeSpecsCount: number;
  onNavigate: (sectionId: string) => void;
  /** In-app home navigation (avoids a full reload / beforeunload while a game is open). */
  onHome: () => void;
  /** Opens the creator control panel. */
  onStudio: () => void;
};

export function NavHeader({ activeSpecsCount, onNavigate, onHome, onStudio }: NavHeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        <a href="/" className="logo" onClick={handleLogoClick}>
          <Mascot className="mascot--logo" emotion="idle" size={35} title={t('header.logoAlt')} staticPose />
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
              <button className="nav-link" onClick={() => handleNavClick('my-games')}>
                <PixelIcon name="folder" size={14} /> {t('header.navMyGames')}
                {activeSpecsCount > 0 && <span className="specs-count-badge">{activeSpecsCount}</span>}
              </button>
              {user ? (
                <button
                  className="nav-link"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onStudio();
                  }}
                >
                  <PixelIcon name="wrench" size={14} /> {t('header.navStudio')}
                </button>
              ) : null}

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
