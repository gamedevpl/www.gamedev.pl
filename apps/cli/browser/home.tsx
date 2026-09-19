import { PixelIcon } from '../../web/src/PixelIcon.js';

export function WorkspaceHome() {
  return (
    <section id="workspace-home" hidden aria-labelledby="home-title">
      <span className="eyebrow">GAMEDEV.PL · YOUR WORKSPACE</span>
      <h1 id="home-title">What would you like to play?</h1>
      <p>Continue a game or bring a new idea to life. Everything happens here.</p>
      <button id="home-continue" hidden>
        <PixelIcon name="play" size={16} />
        <span id="home-continue-label">Continue this game</span>
      </button>
      <div className="home-options">
        <div className="home-card">
          <PixelIcon name="folder" size={24} />
          <h2>Open a game</h2>
          <p>Enter the name used in its game link.</p>
          <form id="home-open-form">
            <label className="sr-only" htmlFor="home-slug">
              Game slug
            </label>
            <input
              id="home-slug"
              placeholder="tabletop-turbos"
              maxLength={80}
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}"
            />
            <button id="home-open" type="submit">
              Open game
            </button>
          </form>
        </div>
        <div className="home-card">
          <PixelIcon name="sparkle" size={24} />
          <h2>Create something new</h2>
          <p>Start with an idea, a reference, or a question.</p>
          <button id="home-create" className="primary">
            Create a game
          </button>
        </div>
      </div>
      <p id="home-status" role="status" className="hint">
        Opening a workspace does not start an agent.
      </p>
    </section>
  );
}
