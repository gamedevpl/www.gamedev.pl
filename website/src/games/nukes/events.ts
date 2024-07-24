import { useEffect } from "react";

export function dispatchCustomEvent<T>(eventName: string, data?: T) {
  const event = new CustomEvent(eventName, {
    bubbles: true,
    detail: data,
  });
  document.dispatchEvent(event);
}

export function useCustomEvent<T>(
  eventName: string,
  callback: (data: T) => void
) {
  useEffect(() => {
    const handler = (event: Event | CustomEvent<T>) => {
      callback((event as CustomEvent).detail as T);
    };
    document.addEventListener(eventName, handler, false);
    return () => {
      document.removeEventListener(eventName, handler, false);
    };
  }, [eventName, callback]);
}
