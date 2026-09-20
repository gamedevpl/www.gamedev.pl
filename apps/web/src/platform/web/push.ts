import {
  isPushSupported,
  isSubscribed,
  pushPermission,
  pushUiState,
  subscribeToPush,
  unsubscribeFromPush,
} from '../../pushApi.js';
import type { PushPlatform } from '../types.js';

export const webPush: PushPlatform = {
  isSupported: isPushSupported,
  permission: pushPermission,
  subscribe: subscribeToPush,
  unsubscribe: unsubscribeFromPush,
  isSubscribed,
  uiState: pushUiState,
};
