import { useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { connectPath } from './core/router.js';
import './create-agent-callout.css';

export type CreateAgentCalloutProps = {
  onNavigate?: (path: string) => void;
};

export function CreateAgentCallout({ onNavigate }: CreateAgentCalloutProps) {
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
    <aside className="create-agent-callout" aria-label={t('create.agentCalloutAria')}>
      <div className="create-agent-callout-icon" aria-hidden="true">
        <PixelIcon name="code" size={16} />
      </div>
      <div className="create-agent-callout-body">
        <strong className="create-agent-callout-title">{t('create.agentCalloutTitle')}</strong>
        <span className="create-agent-callout-detail">{t('create.agentCalloutDetail')}</span>
      </div>
      <div className="create-agent-callout-actions">
        <a href={connectPath()} className="create-agent-callout-btn" onClick={handleNavClick(connectPath())}>
          <span>{t('create.agentCalloutLink')}</span>
          <PixelIcon name="arrowRight" size={12} />
        </a>
      </div>
    </aside>
  );
}
