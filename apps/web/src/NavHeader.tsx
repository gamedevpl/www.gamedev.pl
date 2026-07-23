import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { LanguageSwitcher } from './LanguageSwitcher';
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

  return (
    <header className="app-header">
      <div className="logo-brand">
        <a href="#/" className="logo">
          <img src={logo} alt={t('header.logoAlt')} width="60" height="52" />
          gamedev<span className="turquoise">.pl</span>
        </a>
        <div className="status-indicator">
          <span className="pulse-dot"></span>
          <span className="status-text">{t('header.statusOnline')}</span>
        </div>
      </div>

      <nav className="header-nav">
        <button className="nav-link" onClick={() => onNavigate('hero-prompt')}>
          ✨ {t('header.navPrompt')}
        </button>
        <button className="nav-link" onClick={() => onNavigate('arcade')}>
          🕹️ {t('header.navArcade')}
        </button>
        <button className="nav-link" onClick={() => onNavigate('studio')}>
          📂 {t('header.navStudio')}
        </button>
        <button className="nav-link" onClick={() => onNavigate('transparency')}>
          📡 {t('header.navFeed')}
        </button>
      </nav>

      <div className="header-actions">
        {activeSpecsCount > 0 && (
          <button className="my-specs-badge" onClick={() => onNavigate('studio-active')}>
            📂 {t('header.mySpecs', { count: activeSpecsCount })}
          </button>
        )}

        {user ? (
          <div className="user-profile-badge">
            {user.picture ? (
              <img src={user.picture} alt="" className="user-avatar" width="28" height="28" />
            ) : (
              <span className="user-avatar-placeholder">👤</span>
            )}
            <span className="user-name">{user.name || user.email || 'User'}</span>
            <button className="logout-btn" onClick={logout} title="Sign Out">
              🚪
            </button>
          </div>
        ) : (
          <button className="sign-in-btn" onClick={() => setIsAuthModalOpen(true)}>
            🔑 Sign in
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
          <img src={githubIcon} alt="" />
        </a>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
}
