import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { useCliSurfaceEnabled } from './useCliSurfaceEnabled.js';

const MCP_PATH = '/api/mcp';
const CLAUDE_PLUGIN = 'https://github.com/gamedevpl/www.gamedev.pl/tree/master/listings/mcp/claude-plugin';
const MCP_REGISTRY = 'https://github.com/modelcontextprotocol/registry';

export function ConnectAgentsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const cliOn = useCliSurfaceEnabled();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.gamedev.pl';
  const mcpUrl = `${origin}${MCP_PATH}`;
  const install = `curl -fsSL ${origin}/install.sh | bash`;

  return (
    <article className="connect-page">
      <header className="contact-header">
        <button type="button" className="secondary-btn contact-back" onClick={onBack}>
          <PixelIcon name="close" size={12} /> {t('connectAgents.back')}
        </button>
        <h1 className="contact-title">{t('connectAgents.title')}</h1>
        <p className="contact-intro">{t('connectAgents.intro')}</p>
      </header>

      <nav className="connect-jump" aria-label={t('connectAgents.jump')}>
        <a href="#mcp">{t('connectAgents.mcp.nav')}</a>
        <a href="#cli">{t('connectAgents.cli.nav')}</a>
      </nav>

      <section id="mcp" className="connect-section">
        <h2 className="connect-section-title">
          <PixelIcon name="globe" size={16} /> {t('connectAgents.mcp.title')}
        </h2>
        <p>{t('connectAgents.mcp.lead')}</p>
        <pre className="connect-snippet" tabIndex={0}>
          {mcpUrl}
        </pre>
        <ul className="connect-list">
          <li>{t('connectAgents.mcp.oauth')}</li>
          <li>
            {t('connectAgents.mcp.studio')} <a href="/studio">{t('connectAgents.mcp.studioLink')}</a>
          </li>
          <li>
            <a href={CLAUDE_PLUGIN} target="_blank" rel="noreferrer noopener">
              {t('connectAgents.mcp.claude')}
            </a>
          </li>
          <li>
            <a href={MCP_REGISTRY} target="_blank" rel="noreferrer noopener">
              {t('connectAgents.mcp.registry')}
            </a>
            {' — '}
            <code>pl.gamedev/creator</code>
          </li>
        </ul>
        <p className="connect-note">{t('connectAgents.beta')}</p>
      </section>

      <section id="cli" className="connect-section">
        <h2 className="connect-section-title">
          <PixelIcon name="code" size={16} /> {t('connectAgents.cli.title')}
        </h2>
        <p>{t('connectAgents.cli.lead')}</p>
        {cliOn ? (
          <>
            <pre className="connect-snippet" tabIndex={0}>
              {install}
            </pre>
            <p className="connect-hint">{t('connectAgents.cli.installHint')}</p>
          </>
        ) : (
          <p className="connect-hint">{t('connectAgents.cli.installPending')}</p>
        )}
        <ul className="connect-list">
          <li>{t('connectAgents.cli.repl')}</li>
          <li>{t('connectAgents.cli.checkout')}</li>
          <li>{t('connectAgents.cli.ci')}</li>
        </ul>
      </section>
    </article>
  );
}
