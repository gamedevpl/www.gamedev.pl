// Client for Web Push opt-in (docs/notifications-plan.md M2). Registers the service
// worker, asks the browser to subscribe with our VAPID key, and syncs the
// subscription with the backend. Same-origin in production; the session cookie
// authenticates. All calls are no-ops on browsers without push support, so the
// caller can invoke them unconditionally.
//
// Scope (M2 "80/20"): desktop Chrome/Firefox/Edge + Android. iOS Safari only
// delivers push to a home-screen-installed PWA, which we don't build yet — there
// `isPushSupported()` is still true but the OS permission never sticks in a plain
// tab, so we simply surface whatever state the browser reports.

import { hasServiceWorkerSupport } from './serviceWorkerSupport.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/** Whether this browser has the APIs Web Push needs at all. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' && hasServiceWorkerSupport() && 'PushManager' in window && 'Notification' in window
  );
}

/** Current OS-level permission, or 'unsupported'. Cheap and synchronous. */
export function pushPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermission;
}

interface PushConfig {
  enabled: boolean;
  vapidPublicKey: string | null;
}

async function fetchPushConfig(): Promise<PushConfig> {
  const res = await fetch(`${API_BASE}/api/push/config`, { credentials: 'include' });
  if (!res.ok) throw new Error(`push config failed (${res.status})`);
  return (await res.json()) as PushConfig;
}

// VAPID public keys travel as base64url; the PushManager wants a Uint8Array. Back
// it with an explicit ArrayBuffer so the type is `Uint8Array<ArrayBuffer>`, which
// `applicationServerKey`'s BufferSource requires (a plain Uint8Array is
// ArrayBufferLike and TS rejects the SharedArrayBuffer possibility).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

/** True if this browser already holds an active push subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return false;
  return Boolean(await reg.pushManager.getSubscription());
}

/**
 * Opt in: register the worker, request permission (this must run from a user
 * gesture, or the browser rejects it), subscribe, and persist server-side.
 * Returns the resulting permission so the UI can explain a denial.
 */
export async function subscribeToPush(): Promise<PushPermission> {
  if (!isPushSupported()) return 'unsupported';

  const config = await fetchPushConfig();
  if (!config.enabled || !config.vapidPublicKey) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushPermission;

  const reg = await ensureRegistration();
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    }));

  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error(`push subscribe failed (${res.status})`);

  return 'granted';
}

export interface PushUiState {
  /** Show the opt-in control at all (browser supports push AND server is configured). */
  show: boolean;
  subscribed: boolean;
  permission: PushPermission;
}

/**
 * One call the bell uses to decide what to render: hides the control on
 * unsupported browsers or when the server has no VAPID keys, and reports whether
 * this browser is already subscribed. Never throws — degrades to hidden.
 */
export async function pushUiState(): Promise<PushUiState> {
  const permission = pushPermission();
  if (permission === 'unsupported') return { show: false, subscribed: false, permission };
  try {
    const config = await fetchPushConfig();
    if (!config.enabled) return { show: false, subscribed: false, permission };
    return { show: true, subscribed: await isSubscribed(), permission };
  } catch {
    return { show: false, subscribed: false, permission };
  }
}

/** Opt out: drop the browser subscription and tell the server to forget it. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await fetch(`${API_BASE}/api/push/unsubscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
