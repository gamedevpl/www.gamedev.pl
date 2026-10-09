export function BuildError() {
  return (
    <section id="build-error" hidden aria-labelledby="build-error-title">
      <h2 id="build-error-title">Build failed</h2>
      <p id="build-error-description" />
      <details id="build-error-details">
        <summary>Error details</summary>
        <pre id="build-error-text" />
      </details>
      <div className="build-error-actions">
        <button id="build-error-fix" type="button" className="primary">
          Fix with agent
        </button>
        <button id="build-error-retry" type="button">
          Retry build
        </button>
        <button id="build-error-copy" type="button">
          Copy error
        </button>
      </div>
      <p id="build-error-question" hidden>
        Answer the current question in Chat before preparing a repair request.
      </p>
      <p id="build-error-feedback" role="status" />
    </section>
  );
}
