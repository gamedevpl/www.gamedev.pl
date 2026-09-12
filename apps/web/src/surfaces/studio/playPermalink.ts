// Same-tab /play stays in-app so a fresh draft can retry.
export function interceptPlayPermalink(
  event: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    preventDefault: () => void;
  },
  slug: string,
  onPlayPermalink?: (slug: string) => void,
): void {
  if (!onPlayPermalink || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  onPlayPermalink(slug);
}
