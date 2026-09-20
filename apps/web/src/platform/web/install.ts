import {
  clearInstallPrompt,
  dismissInstall,
  installDismissedAt,
  isIosInstallCandidate,
  isStandalone,
  pendingInstallPrompt,
  recordVisit,
  shouldOfferInstall,
  subscribeInstallPrompt,
  visitCount,
  watchInstallPrompt,
} from '../../pwa.js';
import type { InstallPlatform } from '../types.js';

export const webInstall: InstallPlatform = {
  isStandalone,
  isIosInstallCandidate: () => isIosInstallCandidate(navigator.userAgent, navigator.maxTouchPoints),
  watch: watchInstallPrompt,
  pending: pendingInstallPrompt,
  subscribe: subscribeInstallPrompt,
  clear: clearInstallPrompt,
  recordVisit,
  visitCount,
  installDismissedAt,
  dismiss: dismissInstall,
  shouldOffer: shouldOfferInstall,
};
