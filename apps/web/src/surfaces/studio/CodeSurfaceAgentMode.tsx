import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { recordCodeStep } from '../../visitTelemetry.js';
import { AGENT_GUIDE, codeSurfaceToolNames, runAgentConsoleCommand } from './webmcp.js';

// How many past command/result pairs stay visible.
const AGENT_CONSOLE_HISTORY_LIMIT = 20;

type AgentConsoleHistoryEntry = { n: number; command: string; output: string; ok: boolean };

// The WebMCP opt-in and the tool console, one dialog.
export function CodeSurfaceAgentMode({
  slug,
  open,
  enabled,
  onToggle,
  onClose,
}: {
  slug: string;
  open: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [agentConsoleInput, setAgentConsoleInput] = useState('{"tool":"get_sources","input":{}}');
  const [agentConsoleHistory, setAgentConsoleHistory] = useState<AgentConsoleHistoryEntry[]>([]);
  const [agentConsoleBusy, setAgentConsoleBusy] = useState(false);
  const agentConsoleBusyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function runAgentConsole() {
    if (agentConsoleBusyRef.current) return;
    agentConsoleBusyRef.current = true;
    setAgentConsoleBusy(true);
    recordCodeStep('agent_console_run');
    const command = agentConsoleInput;
    try {
      const result = await runAgentConsoleCommand(slug, command);
      setAgentConsoleHistory((prev) => {
        const n = (prev[0]?.n ?? 0) + 1;
        const entry: AgentConsoleHistoryEntry = { n, command, output: result.output, ok: result.ok };
        return [entry, ...prev].slice(0, AGENT_CONSOLE_HISTORY_LIMIT);
      });
    } finally {
      agentConsoleBusyRef.current = false;
      setAgentConsoleBusy(false);
    }
  }

  // Stays mounted while closed so command, history and run survive.
  if (!open) return null;

  return (
    <div className="code-surface-agent-mode-backdrop" role="presentation" onClick={() => onClose()}>
      <section
        className="code-surface-agent-mode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-surface-agent-mode-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="code-surface-agent-mode-head">
          <h3 id="code-surface-agent-mode-title">{t('studioPanel.code.agentMode.title')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => onClose()}
            aria-label={t('studioPanel.code.agentMode.close')}
          >
            <PixelIcon name="close" size={13} />
          </button>
        </header>

        <div className="code-surface-agent-mode-section">
          <label className="code-surface-agent-mode-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
            {t('studioPanel.code.agentMode.webmcpToggle')}
          </label>
          <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.webmcpHint')}</p>
        </div>

        <div className="code-surface-agent-mode-section">
          <h4>{t('studioPanel.code.agentMode.bridgeTitle')}</h4>
          <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.bridgeHint', { slug })}</p>
          <StudioCreatorAgentKeyPanel />
        </div>

        <div className="code-surface-agent-mode-section">
          <h4>{t('studioPanel.code.agentMode.consoleTitle')}</h4>
          <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.consoleHint')}</p>
          <p className="code-surface-agent-console-tools">{codeSurfaceToolNames().join(' · ')}</p>
          <textarea
            className="code-surface-agent-console-input"
            value={agentConsoleInput}
            onChange={(event) => setAgentConsoleInput(event.target.value)}
            spellCheck={false}
            rows={4}
            aria-label={t('studioPanel.code.agentMode.consoleInputLabel')}
          />
          <button
            type="button"
            className="code-surface-agent-console-run"
            onClick={() => void runAgentConsole()}
            disabled={agentConsoleBusy}
          >
            {agentConsoleBusy
              ? t('studioPanel.code.agentMode.consoleRunning')
              : t('studioPanel.code.agentMode.consoleRun')}
          </button>
          {agentConsoleHistory.length > 0 ? (
            <ol className="code-surface-agent-console-history" aria-live="polite">
              {agentConsoleHistory.map((entry) => (
                <li key={entry.n} className={`code-surface-agent-console-entry${entry.ok ? '' : ' is-error'}`}>
                  <div className="code-surface-agent-console-entry-command">
                    #{entry.n} {entry.command}
                  </div>
                  <pre className="code-surface-agent-console-output" tabIndex={0}>
                    {entry.output}
                  </pre>
                </li>
              ))}
            </ol>
          ) : null}
          <details className="code-surface-agent-console-guide">
            <summary>{t('studioPanel.code.agentMode.consoleGuide')}</summary>
            <pre>{AGENT_GUIDE}</pre>
          </details>
        </div>
      </section>
    </div>
  );
}
