import { useState } from 'react';
import { RemixSetting } from '../../RemixSetting.js';
import './admin-small-panels.css';

// Remix is an allowlist; admins turn it on per game slug.
export function RemixAllowPanel() {
  const [draft, setDraft] = useState('');
  const [slug, setSlug] = useState<string | null>(null);

  const open = () => {
    const next = draft.trim().toLowerCase();
    setSlug(/^[a-z0-9][a-z0-9-]*$/.test(next) ? next : null);
  };

  return (
    <section className="admin-limits">
      <h2 className="health-section-title">Allow remixing</h2>
      <p className="health-summary">
        Remix is off for every game until its creator or an admin turns it on. The game must also declare{' '}
        <code>editor: content</code>.
      </p>
      <div className="admin-limits-controls">
        <label className="admin-limits-cap">
          Game slug
          <input
            type="text"
            value={draft}
            placeholder="airtime"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') open();
            }}
          />
        </label>
        <button type="button" onClick={open}>
          Open
        </button>
      </div>
      {slug ? <RemixSetting key={slug} slug={slug} scope="admin" /> : null}
    </section>
  );
}
