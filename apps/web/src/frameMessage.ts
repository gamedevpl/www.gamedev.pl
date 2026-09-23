export function isFromGameFrame(event: MessageEvent, frame: HTMLIFrameElement | Window | null | undefined): boolean {
  if (event.origin !== 'null') return false;
  const win = frame && 'contentWindow' in frame ? frame.contentWindow : frame;
  return win != null && event.source === win;
}
