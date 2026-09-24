import { useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { connectPath } from './core/router.js';
import './create-builders.css';

export type CreateBuilderLanesProps = {
  onNavigate?: (path: string) => void;
};

export function CreateBuilderLanes({ onNavigate }: CreateBuilderLanesProps) {
  const { t } = useTranslation();

  const handleNavClick = useCallback(
    (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!path.includes('#')) {
        window.scrollTo(0, 0);
      }
      if (onNavigate) {
        onNavigate(path);
      } else {
        window.location.href = path;
      }
    },
    [onNavigate],
  );

  return (
    <section className="create-builders" aria-labelledby="create-builders-heading">
      <div className="create-builders-head">
        <h2 id="create-builders-heading" className="create-section-heading">
          {t('create.buildersHeading')}
        </h2>
        <span className="create-builders-sub">{t('create.buildersSub')}</span>
      </div>
      <div className="create-builder-lanes">
        <div className="create-builder-lane is-picked">
          <div className="create-builder-mark" aria-hidden="true">
            <PixelIcon name="sparkle" size={22} />
          </div>
          <div className="create-builder-lane-head">
            <span className="create-builder-lane-title">{t('builder.platform.title')}</span>
            <span className="create-builder-lane-badge is-turq">{t('create.defaultBadge')}</span>
          </div>
          <div className="create-builder-progress" aria-hidden="true">
            <span />
          </div>
          <p className="create-builder-lane-detail">{t('builder.platform.detail')}</p>
          <ul className="create-builder-lane-list">
            <li>{t('create.platformPoint1')}</li>
            <li>{t('create.platformPoint2')}</li>
          </ul>
        </div>
        <div className="create-builder-lane">
          <div className="create-builder-mark" aria-hidden="true">
            <PixelIcon name="code" size={22} />
          </div>
          <div className="create-builder-lane-head">
            <span className="create-builder-lane-title">{t('builder.self.title')}</span>
            <span className="create-builder-lane-badge">{t('create.freeBadge')}</span>
          </div>
          <div className="create-agent-chips">
            <a href={connectPath('mcp')} className="create-agent-chip" onClick={handleNavClick(connectPath('mcp'))}>
              {t('connect.clients.claudeCode')}
            </a>
            <a href={connectPath('mcp')} className="create-agent-chip" onClick={handleNavClick(connectPath('mcp'))}>
              {t('connect.clients.codex')}
            </a>
            <a href={connectPath('mcp')} className="create-agent-chip" onClick={handleNavClick(connectPath('mcp'))}>
              {t('connect.clients.cursor')}
            </a>
            <a href={connectPath('mcp')} className="create-agent-chip" onClick={handleNavClick(connectPath('mcp'))}>
              {t('create.anyMcpClient')}
            </a>
          </div>
          <p className="create-builder-lane-detail">{t('builder.self.detail')}</p>
          <ul className="create-builder-lane-list">
            <li>{t('create.selfPoint1')}</li>
            <li>{t('create.selfPoint2')}</li>
          </ul>
          <div className="create-builder-lane-cta">
            <a href={connectPath()} className="create-builder-cta-btn" onClick={handleNavClick(connectPath())}>
              <PixelIcon name="code" size={14} />
              <span>{t('create.connectGuideBtn')}</span>
              <PixelIcon name="arrowRight" size={12} />
            </a>
            <div className="create-builder-cta-sub">
              <span className="create-builder-cta-sub-label">{t('create.connectQuickJump')}:</span>
              <a
                href={connectPath('mcp')}
                className="create-builder-cta-link"
                onClick={handleNavClick(connectPath('mcp'))}
              >
                {t('create.connectMcpLink')}
              </a>
              <span className="create-builder-cta-sep" aria-hidden="true">
                ·
              </span>
              <a
                href={connectPath('cli')}
                className="create-builder-cta-link"
                onClick={handleNavClick(connectPath('cli'))}
              >
                {t('create.connectCliLink')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
