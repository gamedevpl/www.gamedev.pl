import type {
  AppleSignInInitConfig,
  AppleSignInPlatform,
  AppleSignInResponse,
  AuthPlatform,
  GoogleSignInConfig,
  GoogleSignInPlatform,
} from '../types.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id?: string;
            auto_select?: boolean;
            callback: (res: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          usePopup?: boolean;
        }) => void;
        signIn: () => Promise<AppleSignInResponse>;
      };
    };
  }
}

const GOOGLE_GIS_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SDK_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

function isGoogleSdkLoaded(): boolean {
  return Boolean(window.google?.accounts?.id);
}

// Loaded once; a mounted widget reuses the same script tag.
function loadGoogleSdk(onLoad: () => void, onError: () => void): void {
  if (isGoogleSdkLoaded()) {
    onLoad();
    return;
  }
  const script = document.createElement('script');
  script.src = GOOGLE_GIS_SRC;
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  script.onerror = onError;
  document.body.appendChild(script);
}

function initGoogle(config: GoogleSignInConfig): void {
  window.google?.accounts.id.initialize({
    client_id: config.clientId,
    auto_select: config.autoSelect,
    callback: (res) => config.onCredential(res.credential),
  });
}

function renderGoogleButton(container: HTMLElement, options: Record<string, unknown>): void {
  window.google?.accounts.id.renderButton(container, options);
}

function promptGoogleOneTap(): void {
  window.google?.accounts?.id?.prompt();
}

function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect?.();
}

const google: GoogleSignInPlatform = {
  isSdkLoaded: isGoogleSdkLoaded,
  loadSdk: loadGoogleSdk,
  init: initGoogle,
  renderButton: renderGoogleButton,
  promptOneTap: promptGoogleOneTap,
  disableAutoSelect: disableGoogleAutoSelect,
};

function isAppleSdkLoaded(): boolean {
  return Boolean(window.AppleID?.auth);
}

// A second mount reuses the in-flight script, not a new one.
function loadAppleSdk(onLoad: () => void, onError: () => void): void {
  if (isAppleSdkLoaded()) {
    onLoad();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SDK_SRC}"]`);
  if (existing) {
    existing.addEventListener('load', onLoad);
    return;
  }
  const script = document.createElement('script');
  script.src = APPLE_SDK_SRC;
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  script.onerror = onError;
  document.body.appendChild(script);
}

function initApple(config: AppleSignInInitConfig): void {
  window.AppleID?.auth.init(config);
}

async function appleSignIn(): Promise<AppleSignInResponse> {
  if (!window.AppleID?.auth) throw new Error('Apple SDK not loaded');
  return window.AppleID.auth.signIn();
}

const apple: AppleSignInPlatform = {
  isSdkLoaded: isAppleSdkLoaded,
  loadSdk: loadAppleSdk,
  init: initApple,
  signIn: appleSignIn,
};

export const webAuth: AuthPlatform = { google, apple };
