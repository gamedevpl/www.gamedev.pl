import { Fragment, type ReactNode } from 'react';
import { parseSpecBlocks } from './specBlocks.js';

/**
 * Renders a game's SPEC.md body as React elements — the game page's README pane.
 *
 * Hand-rolled on purpose. SPEC text is agent-authored and prompt-influenced, so it
 * is untrusted (games-repo risk R4: injected spec text), and the repo's standing
 * answer to prose is structured rendering rather than a markdown dependency (see
 * apps/web/src/legal/types.ts). Everything here is built as elements — no
 * `dangerouslySetInnerHTML` anywhere — so React's own escaping is the sanitiser
 * and there is no HTML parse step for hostile input to reach. Raw HTML in the
 * source renders as visible text, which is the correct fate for it.
 *
 * The dialect is the small subset SPECs actually use: headings, paragraphs,
 * unordered/ordered lists, fenced code blocks, horizontal rules, and inline
 * bold / italic / code / http(s) links.
 */

interface SpecMarkdownProps {
  markdown: string;
}

/** The heading levels a shifted SPEC heading can land on. */
type HeadingTag = 'h3' | 'h4' | 'h5' | 'h6';

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const split = token.indexOf('](');
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      // http(s) only, enforced by the token pattern; never a trust signal.
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="nofollow noopener noreferrer">
          {label}
        </a>,
      );
    }
    last = index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SpecMarkdown({ markdown }: SpecMarkdownProps) {
  const blocks = parseSpecBlocks(markdown);
  return (
    <div className="spec-markdown">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            // Shifted down one level: the page already has its own h1/h2 chrome,
            // and a SPEC's `#` title must not outrank it in the outline. Typed as the
            // union of what the clamp can actually produce, rather than asserting one
            // member of it — the levels are the contract, not `h3` specifically.
            const Tag: HeadingTag = `h${Math.min(block.level + 2, 6) as 3 | 4 | 5 | 6}`;
            return <Tag key={index}>{renderInline(block.text)}</Tag>;
          }
          case 'paragraph':
            return <p key={index}>{renderInline(block.text)}</p>;
          case 'list': {
            const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
            return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
          }
          case 'code':
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            );
          case 'rule':
            return <hr key={index} />;
          default:
            return <Fragment key={index} />;
        }
      })}
    </div>
  );
}
