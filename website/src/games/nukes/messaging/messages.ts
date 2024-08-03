import { dispatchCustomEvent, useCustomEvent } from '../events';

export const CUSTOM_EVENT_NAME_MESSAGE = 'fullScreenMessage';
export const CUSTOM_EVENT_NAME_ACTION = 'fullScreenMessageAction';

/** Full screen message event payload */
export interface FullScreenMessageEvent {
  message: string | string[];
  startTimestamp: number;
  endTimestamp: number;
  messageId: string;
  actions?: { id: string; text: string }[];
  prompt?: boolean;
  fullScreen?: boolean;
}

/** Display a full screen message */
export function dispatchFullScreenMessage(
  message: string | string[],
  startTimestamp: number,
  endTimestamp: number,
  messageId = '',
  actions?: { id: string; text: string }[],
  prompt?: boolean,
  fullScreen?: boolean,
) {
  dispatchCustomEvent<FullScreenMessageEvent>(CUSTOM_EVENT_NAME_MESSAGE, {
    message,
    startTimestamp,
    endTimestamp,
    messageId,
    actions,
    prompt,
    fullScreen: fullScreen ?? !!actions?.length,
  });
}

export function dispatchFullScreenMessageAction(messageId: string, actionId: string) {
  dispatchCustomEvent(CUSTOM_EVENT_NAME_ACTION, { messageId, actionId });
}

/** Hook for handling full screen messages */
export function useFullScreenMessageEvent(callback: (event: FullScreenMessageEvent) => void) {
  useCustomEvent<FullScreenMessageEvent>(CUSTOM_EVENT_NAME_MESSAGE, (event) => {
    callback(event);
  });
}

export function useFullScreenMessageActionEvent(callback: (event: { messageId: string; actionId: string }) => void) {
  useCustomEvent<{ messageId: string; actionId: string }>(CUSTOM_EVENT_NAME_ACTION, (event) => {
    callback(event);
  });
}
