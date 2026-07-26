import { useEffect } from 'react';

/**
 * Keep `document.title` in sync with the active view. Last caller wins — child
 * views (e.g. a draft that just loaded its real name) may refine the title App
 * set from the route alone.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
