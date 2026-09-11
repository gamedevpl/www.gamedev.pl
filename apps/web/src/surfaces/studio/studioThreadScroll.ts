// Stick-to-bottom targets content end, not the runway pad.
export type StudioThreadScrollPane = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
  querySelector: (selectors: string) => Element | null;
};

function padHeightOf(pane: StudioThreadScrollPane): number {
  const pad = pane.querySelector('.studio-thread-scroll-pad');
  if (!pad || !('offsetHeight' in pad)) return 0;
  const height = (pad as { offsetHeight: unknown }).offsetHeight;
  return typeof height === 'number' ? height : 0;
}

// Last turn at pane bottom; pad stays below the fold.
export function studioThreadContentScrollTop(pane: StudioThreadScrollPane): number {
  return Math.max(0, pane.scrollHeight - pane.clientHeight - padHeightOf(pane));
}

// Near content end (into pad still counts as following).
export function studioThreadNearContentEnd(pane: StudioThreadScrollPane, slackPx = 48): boolean {
  return pane.scrollHeight - padHeightOf(pane) - (pane.scrollTop ?? 0) - pane.clientHeight < slackPx;
}
