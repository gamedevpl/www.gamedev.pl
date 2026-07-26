import { useEffect, useRef, useState, type RefObject } from 'react';

export type UseInViewOptions = {
  /** Expand the root intersection box so media can prefetch before it enters view. */
  rootMargin?: string;
  /** Once true, stay true — catalog media should not unload after scrolling away. */
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
    if (!el || (once && inView)) return;

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
          if (once) observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, once, inView]);

  return { ref, inView };
}
