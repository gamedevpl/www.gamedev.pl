export function messageFromFrame(win: object, data: unknown, origin = 'null'): MessageEvent {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: win });
  return event;
}

export function dispatchFromFrame(win: object, data: unknown, origin = 'null'): void {
  window.dispatchEvent(messageFromFrame(win, data, origin));
}
