import { useTranslation } from 'react-i18next';
import githubIcon from './assets/github-mark-white.svg';

export function TransparencySection() {
  const { t } = useTranslation();

  return (
    <section id="transparency" className="panel transparency-panel">
      <div className="section-header">
        <h2 className="section-title">{t('transparency.title')}</h2>
        <p className="panel-copy">{t('transparency.subtitle')}</p>
      </div>

      <div className="transparency-grid">
        <div className="transparency-card activity-feed">
          <h3>📡 {t('transparency.liveActivityTitle')}</h3>
          <ul className="activity-list">
            <li>
              <span className="time-badge">10m ago</span>
              <span>{t('transparency.activity1')}</span>
            </li>
            <li>
              <span className="time-badge">1h ago</span>
              <span>{t('transparency.activity2')}</span>
            </li>
            <li>
              <span className="time-badge">3h ago</span>
              <span>{t('transparency.activity3')}</span>
            </li>
          </ul>
        </div>

        <div className="transparency-card security-card">
          <h3>🔒 {t('transparency.securityTitle')}</h3>
          <p>{t('transparency.securityBody')}</p>
        </div>

        <div className="transparency-card open-source-card">
          <h3>🌐 {t('transparency.openSourceTitle')}</h3>
          <p>{t('transparency.openSourceBody')}</p>
          <a
            href="https://github.com/gamedevpl/www.gamedev.pl"
            target="_blank"
            rel="noopener noreferrer"
            className="github-btn"
          >
            <img src={githubIcon} alt="" width="20" height="20" />
            {t('transparency.viewGithub')}
          </a>
        </div>
      </div>
    </section>
  );
}
