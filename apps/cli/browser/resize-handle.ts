type ResizeOptions = {
  axis: 'x' | 'y';
  sign: () => number;
  bounds: () => [number, number];
  read: () => number;
  write: (value: number, save: boolean) => void;
  reset: () => void;
};

export function installResizeHandle(handle: HTMLElement, options: ResizeOptions) {
  const clamp = (value: number) => {
    const [min, max] = options.bounds();
    return Math.round(Math.min(max, Math.max(min, value)));
  };
  const sync = () => {
    const [min, max] = options.bounds();
    handle.setAttribute('aria-valuemin', String(Math.round(min)));
    handle.setAttribute('aria-valuemax', String(Math.round(max)));
    handle.setAttribute('aria-valuenow', String(clamp(options.read())));
  };
  const write = (value: number, save: boolean) => {
    options.write(clamp(value), save);
    sync();
  };
  const coordinate = (event: PointerEvent) => (options.axis === 'x' ? event.clientX : event.clientY);
  let active: { pointer: number; coordinate: number; size: number; sign: number } | undefined;
  const finish = () => {
    if (!active) return;
    active = undefined;
    delete document.body.dataset.resizing;
    delete document.body.dataset.resizeAxis;
    write(options.read(), true);
  };
  handle.onpointerdown = (event) => {
    if (event.button !== 0 || active) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    active = {
      pointer: event.pointerId,
      coordinate: coordinate(event),
      size: clamp(options.read()),
      sign: options.sign(),
    };
    handle.setPointerCapture?.(event.pointerId);
    document.body.dataset.resizing = 'true';
    document.body.dataset.resizeAxis = options.axis;
  };
  handle.onpointermove = (event) => {
    if (active && event.pointerId === active.pointer)
      write(active.size + active.sign * (coordinate(event) - active.coordinate), false);
  };
  handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = finish;
  window.addEventListener('blur', finish);
  handle.ondblclick = () => {
    finish();
    options.reset();
    sync();
  };
  handle.onkeydown = (event) => {
    if (event.key === 'Escape' && active) {
      const size = active.size;
      finish();
      write(size, true);
    } else {
      const [negative, positive] = options.axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      const [min, max] = options.bounds();
      if (event.key === 'Home' || event.key === 'End') write(event.key === 'Home' ? min : max, true);
      else if (event.key === negative || event.key === positive)
        write(
          clamp(options.read()) + (event.key === positive ? 1 : -1) * options.sign() * (event.shiftKey ? 48 : 24),
          true,
        );
      else return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  sync();
  return sync;
}
