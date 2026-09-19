import { WorkspaceHome } from './home.js';
import { PixelIcon, type PixelIconName } from '../../web/src/PixelIcon.js';
import { Conversation } from './conversation.js';

function Icon({ name }: { name: PixelIconName }) {
  return <PixelIcon name={name} size={16} />;
}

export function PlayShell() {
  return (
    <>
      <WorkspaceHome />
      <nav id="tools" aria-label="Play controls">
        <div className="game-badge">
          <Icon name="gamepad" />
          <div>
            <strong id="game-name">gamedev.pl</strong>
            <span id="connection" role="status">
              Connecting…
            </span>
          </div>
        </div>
        <div className="stage-actions">
          <button id="apply" hidden>
            Apply update
          </button>
          <button id="restart" hidden>
            Restart with update
          </button>
          <button id="devices-open" title="Test on phone">
            <Icon name="phone" />
            <span>Devices</span>
          </button>
          <button id="commands-open" title="Commands">
            <Icon name="menu" />
            <span>Commands</span>
          </button>
          <button id="fullscreen" title="Fullscreen" aria-label="Fullscreen">
            <Icon name="expand" />
          </button>
          <button id="clean" title="Hide controls" aria-label="Hide controls">
            <Icon name="eye" />
          </button>
          <button id="edit" className="primary" aria-controls="panel" aria-expanded="false">
            <Icon name="chat" />
            Chat
          </button>
        </div>
      </nav>
      <button id="reveal" hidden aria-label="Show Play controls">
        <Icon name="pencil" />
        Show controls
      </button>
      <pre id="notice" role="status" />
      <aside id="panel" hidden aria-labelledby="panel-title">
        <header className="panel-head">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h1 id="panel-title">Conversation</h1>
          </div>
          <button id="dock" aria-label="Move conversation left">
            <Icon name="panel" />
          </button>
          <button id="close" aria-label="Close conversation">
            <Icon name="close" />
          </button>
        </header>
        <p id="identity" />
        <Conversation />
        <section id="task-card" aria-label="Current task">
          <div id="task" />
          <button id="stop" type="button" disabled>
            <Icon name="stop" />
            Stop task
          </button>
        </section>
        <div id="queue" />
        <form id="composer">
          <p id="question" />
          <div id="choices" />
          <div id="route-row">
            <span id="destination">To: session assistant</span>
            <button id="agent-settings" type="button" title="Execution commands">
              Change…
            </button>
          </div>
          <label id="prompt-label" className="sr-only" htmlFor="prompt">
            Your request
          </label>
          <textarea id="prompt" maxLength={8000} placeholder="What would you like to change?" />
          <div id="command-suggestions" hidden aria-label="Command suggestions" />
          <div id="attachments" />
          <div id="actions" className="composer-actions">
            <button
              id="attachments-open"
              type="button"
              title="Attach a file or gameplay evidence"
              aria-label="Attachments"
            >
              <Icon name="image" />
            </button>
            <button id="screenshot" type="button" title="Attach current screenshot">
              Screenshot
            </button>
            <button id="history-open" type="button" title="Prompt history" aria-label="Prompt history">
              <Icon name="clock" />
            </button>
            <button id="send" className="primary" type="submit" disabled>
              Send
            </button>
          </div>
          <p id="feedback" role="status" />
          <button id="retry" type="button" hidden>
            Retry same request
          </button>
          <p id="composer-hint" className="hint">
            Type / for commands · Click the game to play
          </p>
        </form>
      </aside>
      <aside id="workbench-tools" hidden aria-labelledby="drawer-title">
        <header className="panel-head">
          <h2 id="drawer-title">Commands</h2>
          <button id="drawer-close" aria-label="Close tools">
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-scroll">
          <section id="commands-section">
            <label htmlFor="command-search">Find a command</label>
            <input id="command-search" placeholder="Search actions or type /…" autoComplete="off" />
            <div id="command-list" />
            <label htmlFor="operation">Selected command</label>
            <select id="operation" />
            <label htmlFor="operation-argument">Game slug or account handle</label>
            <input id="operation-argument" placeholder="Only for commands that need it" />
            <button id="run-operation" type="button" className="primary">
              Run command
            </button>
            <p className="hint">Commands use the same session as your terminal. Some actions ask for confirmation.</p>
          </section>
          <section id="media-section" hidden>
            <p>Attach a reference, an asset, or evidence from this play session.</p>
            <label htmlFor="purpose">Use uploaded files as</label>
            <select id="purpose">
              <option value="reference">Reference</option>
              <option value="asset">Game asset</option>
            </select>
            <label className="upload-button" htmlFor="upload">
              <Icon name="image" />
              Choose files
              <input
                id="upload"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,video/webm,video/mp4,application/json,text/plain"
              />
            </label>
            <button id="trace">Attach diagnostics</button>
            <button id="record">Enable recording</button>
            <button id="clip">Attach recent clip</button>
            <p className="hint">
              Enable recording before the moment you want to capture. Captures stay attached until removed. Agent
              support for video varies.
            </p>
          </section>
          <section id="devices-section" hidden>
            <div id="devices" />
          </section>
          <section id="history-section" hidden>
            <p>Select an earlier prompt to edit it before sending.</p>
            <div id="prompt-history" />
          </section>
          <section id="details-section" hidden>
            <label htmlFor="policy">When a new build is ready</label>
            <select id="policy">
              <option value="ask">Ask before update</option>
              <option value="auto">Auto · preserve state</option>
              <option value="freeze">Freeze build</option>
            </select>
            <p id="shown-build">No build loaded yet</p>
            <p id="session-lifetime" className="hint" />
            <h3>Session output</h3>
            <pre id="transcript" tabIndex={0} aria-label="Session output" />
          </section>
        </div>
        <footer className="drawer-tabs">
          <button id="details-open">Session details</button>
        </footer>
      </aside>
    </>
  );
}
