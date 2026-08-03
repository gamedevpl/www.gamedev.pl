import { useEffect, useRef, useState, type RefObject } from 'react';

export type UseInViewOptions = {
  /** Expand the root intersection box so media can prefetch before it enters view. */
  rootMargin?: string;
  /**
   * When true (default), stay true after the first intersection.
   * Catalog cards pass false so off-screen preview media can unload.
   */
  once?: boolean;
};

/**
 * Observe whether an element intersects the viewport (or is about to).
 * Used to defer catalog preview images/videos until a card is near the fold.
 */
export function useInView<T extends Element = HTMLElement>(
  options: UseInViewOptions = {},
): { ref: RefObject<T>; inView: boolean } {
  const { rootMargin = '200px 0px', once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // jsdom and very old browsers: load eagerly rather than strand media forever.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            if (!once) setInView(false);
            continue;
          }
          setInView(true);
          // Sticky mode: stop observing after the first hit so we don't churn
          // and don't unload media when the card scrolls away.
          if (once) observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // Intentionally omit `inView`: the observer callback owns that state. Putting
    // it in deps would tear down and recreate the observer on every toggle when
    // `once` is false.
  }, [rootMargin, once]);

  return { ref, inView };
}
