/**
 * Studio transcript stick-to-bottom math.
 *
 * The scroller keeps a Claude/Cursor-shaped runway pad under the turns so the last
 * message can rise to the top of the pane. Stick-to-bottom must target the end of the
 * *content*, not the end of that pad — otherwise the default view is an empty void with
 * the last turn parked at the top of the scrollport.
 */

function padHeightOf(pane: ParentNode): number {
  const pad = pane.querySelector('.studio-thread-scroll-pad');
  return pad instanceof HTMLElement ? pad.offsetHeight : 0;
}

/** ScrollTop that puts the last turn at the bottom of the pane (pad below the fold). */
export function studioThreadContentScrollTop(pane: {
  scrollHeight: number;
  clientHeight: number;
  querySelector: ParentNode['querySelector'];
}): number {
  return Math.max(0, pane.scrollHeight - pane.clientHeight - padHeightOf(pane));
}

/**
 * True when the reader is at (or past) the content end — including into the runway pad.
 * Scrolling up into history clears this; scrolling the last turn toward the top does not.
 */
export function studioThreadNearContentEnd(
  pane: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
    querySelector: ParentNode['querySelector'];
  },
  slackPx = 48,
): boolean {
  return pane.scrollHeight - padHeightOf(pane) - pane.scrollTop - pane.clientHeight < slackPx;
}
