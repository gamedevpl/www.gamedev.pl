import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CODING_AGENT_PLUGIN_TARGETS } from '@gamedevpl/contract';
import { PixelIcon } from './PixelIcon.js';
import './connect-agent-plugins.css';

type Client = (typeof CODING_AGENT_PLUGIN_TARGETS)[number];
const LABELS: Record<Client, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  copilot: 'GitHub Copilot',
  antigravity: 'Antigravity',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  vibe: 'Mistral Vibe',
  muse: 'Muse Code',
};

export function ConnectAgentPlugins() {
  const { t } = useTranslation();
  const [client, setClient] = useState<Client>('claude');
  return (
    <section id="plugins" className="connect-section">
      <h2 className="connect-section-title">
        <PixelIcon name="code" size={16} />
        {t('connectAgents.plugins.title')}
      </h2>
      <p>
        {t('connectAgents.plugins.lead')} <a href="#cli">{t('connectAgents.plugins.installCli')}</a>
      </p>
      <div className="connect-plugin-picker">
        <label htmlFor="connect-plugin-client">{t('connectAgents.plugins.client')}</label>{' '}
        <select id="connect-plugin-client" value={client} onChange={(event) => setClient(event.target.value as Client)}>
          {CODING_AGENT_PLUGIN_TARGETS.map((id) => (
            <option key={id} value={id}>
              {LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <pre className="connect-snippet" tabIndex={0}>{`gamedevpl update\ngamedevpl plugins install ${client}`}</pre>
      <p>{t('connectAgents.plugins.key')}</p>
      {client === 'vibe' && (
        <>
          <p>{t('connectAgents.plugins.vibe')}</p>
          <pre className="connect-snippet" tabIndex={0}>
            gamedevpl plugins configure vibe
          </pre>
        </>
      )}
      {client === 'muse' && <p>{t('connectAgents.plugins.muse')}</p>}
      <p>{t('connectAgents.plugins.restart')}</p>
      <pre
        className="connect-snippet"
        tabIndex={0}
      >{`gamedevpl plugins status ${client}\ngamedevpl plugins update ${client}\ngamedevpl plugins uninstall ${client}`}</pre>
      <p className="connect-note">{t('connectAgents.plugins.update')}</p>
      <p className="connect-note">{t('connectAgents.plugins.preserve')}</p>
    </section>
  );
}
