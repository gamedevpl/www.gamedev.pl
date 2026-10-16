// Subscription endpoints the server may POST to: browser push services only.

// A host matches an entry exactly or as its subdomain.
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Android, Opera, Samsung Internet
  'android.googleapis.com', // legacy GCM-era Chrome endpoints
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge (WNS)
  'push.apple.com', // Safari
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // `URL` drops the default :443, so any remaining port is non-standard.
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
