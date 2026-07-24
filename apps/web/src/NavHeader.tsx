import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { PixelIcon } from './PixelIcon';
import githubIcon from './assets/github-mark-white.svg';
import logo from './logo-gamedev.png';

type NavHeaderProps = {
  activeSpecsCount: number;
  onNavigate: (sectionId: string) => void;
};

export function NavHeader({ activeSpecsCount, onNavigate }: NavHeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    onNavigate(sectionId);
    setIsMenuOpen(false);
  };

  return (
    <header className="app-header">
      <div className="logo-brand">
        <a href="#/" className="logo">
          <img src={logo} alt={t('header.logoAlt')} width="36" height="32" />
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
            <button className="logout-btn" onClick={logout} title="Sign Out">
              Sign out
            </button>
          </div>
        ) : (
          <button className="sign-in-btn" onClick={() => setIsAuthModalOpen(true)}>
            Sign in
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
            </nav>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
}
