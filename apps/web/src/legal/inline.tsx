import { Fragment, type ReactNode } from 'react';

/** Matches the one piece of inline markup the documents may use: `[label](href)`. */
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Renders `[label](href)` links inside a legal paragraph and leaves everything else
 * as text. Deliberately not a markdown parser: the documents are reviewed by hand,
 * links are the only markup they need, and a real parser would be one more thing
 * standing between a lawyer's edit and what the page actually says.
 */
export function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  LINK_PATTERN.lastIndex = 0;

  for (let match = LINK_PATTERN.exec(text); match !== null; match = LINK_PATTERN.exec(text)) {
    const [full, label, href] = match as unknown as [string, string, string];
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    // In-app routes and mail links stay in the tab; outside references open away from
    // it. In-app routes are absolute paths (`/privacy`) since the app moved off hash
    // routing — a bare `#fragment` is still internal, being a link within the document.
    const external = !href.startsWith('/') && !href.startsWith('#') && !href.startsWith('mailto:');
    const linkProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
    parts.push(
      <a key={`${match.index}-${href}`} href={href} {...linkProps}>
        {label}
      </a>,
    );
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}
