export function hasServiceWorkerSupport(): boolean {
  try {
    return 'serviceWorker' in navigator && Boolean(navigator.serviceWorker);
  } catch {
    return false;
  }
}
