import type { PushPermission, PushUiState } from '../pushApi.js';
import type { BeforeInstallPromptEvent } from '../pwa.js';

// Outside this directory, nothing in the SPA may branch on platform.

export type ShareRequest = { url: string; title: string };
// Native (Capacitor) implements this interface later; only web exists today.
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface SharePlatform {
  shareOrCopy(request: ShareRequest): Promise<ShareResult>;
}

export interface PushPlatform {
  isSupported(): boolean;
  permission(): PushPermission;
  subscribe(): Promise<PushPermission>;
  unsubscribe(): Promise<void>;
  isSubscribed(): Promise<boolean>;
  uiState(): Promise<PushUiState>;
}

export interface WakeLockHandle {
  release(): Promise<void>;
}

export interface WakeLockPlatform {
  supported(): boolean;
  // Null means the lock could not be acquired.
  request(): Promise<WakeLockHandle | null>;
}

export type TiltReading = { beta: number | null; gamma: number | null };
export type TiltPermission = 'granted' | 'denied' | 'unsupported';

export interface TiltPlatform {
  supported(): boolean;
  needsPermission(): boolean;
  // Must be called synchronously from a user gesture on iOS; see useDeviceTilt.
  requestPermission(): Promise<TiltPermission>;
  subscribe(onReading: (reading: TiltReading) => void): () => void;
}

export type { BeforeInstallPromptEvent };

export interface InstallEligibilityInput {
  visits: number;
  dismissedAt: number | null;
  now: number;
  standalone: boolean;
}

export interface InstallPlatform {
  isStandalone(): boolean;
  isIosInstallCandidate(): boolean;
  watch(): void;
  pending(): BeforeInstallPromptEvent | null;
  subscribe(listener: (event: BeforeInstallPromptEvent | null) => void): () => void;
  clear(): void;
  recordVisit(): number;
  visitCount(): number;
  installDismissedAt(): number | null;
  dismiss(now?: number): void;
  shouldOffer(input: InstallEligibilityInput): boolean;
}

export type QrScanResult = { text: string } | { unsupported: true };

export interface QrPlatform {
  supported(): boolean;
  // Web reports unsupported honestly instead of faking a scanner.
  scan(): Promise<QrScanResult>;
}

export interface GoogleSignInConfig {
  clientId?: string;
  autoSelect?: boolean;
  onCredential: (idToken: string) => void;
}

export interface GoogleSignInPlatform {
  isSdkLoaded(): boolean;
  loadSdk(onLoad: () => void, onError: () => void): void;
  init(config: GoogleSignInConfig): void;
  renderButton(container: HTMLElement, options: Record<string, unknown>): void;
  promptOneTap(): void;
  disableAutoSelect(): void;
}

export interface AppleSignInResponse {
  authorization?: { id_token?: string; code?: string; state?: string };
  // Sent only on the first authorization; Apple never repeats it later.
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}

export interface AppleSignInInitConfig {
  clientId: string;
  scope: string;
  redirectURI: string;
  usePopup?: boolean;
}

export interface AppleSignInPlatform {
  isSdkLoaded(): boolean;
  loadSdk(onLoad: () => void, onError: () => void): void;
  init(config: AppleSignInInitConfig): void;
  signIn(): Promise<AppleSignInResponse>;
}

export interface AuthPlatform {
  google: GoogleSignInPlatform;
  apple: AppleSignInPlatform;
}

export interface PlatformCapabilities {
  share: SharePlatform;
  push: PushPlatform;
  wakeLock: WakeLockPlatform;
  tilt: TiltPlatform;
  install: InstallPlatform;
  qr: QrPlatform;
  auth: AuthPlatform;
}
