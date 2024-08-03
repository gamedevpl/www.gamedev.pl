import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { dispatchCustomEvent, useCustomEvent } from '../events';
import { WorldState } from '../world/world-state-types';

const CUSTOM_EVENT_NAME_MESSAGE = 'fullScreenMessage';
const CUSTOM_EVENT_NAME_ACTION = 'fullScreenMessageAction';

/** Full screen message event payload */
export interface FullScreenMessageEvent {
  message: string | string[];
  startTimestamp: number;
  endTimestamp: number;
  messageId: string;
  actions?: { id: string; text: string }[];
  prompt?: boolean;
}

/** Display a full screen message */
export function dispatchFullScreenMessage(
  message: string | string[],
  startTimestamp: number,
  endTimestamp: number,
  messageId = '',
  actions?: { id: string; text: string }[],
  prompt?: boolean,
) {
  dispatchCustomEvent<FullScreenMessageEvent>(CUSTOM_EVENT_NAME_MESSAGE, {
    message,
    startTimestamp,
    endTimestamp,
    messageId,
    actions,
    prompt,
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

/** A component that displays the most recent full screen message */
export function FullScreenMessages({ worldState }: { worldState: WorldState }) {
  const [events, setEvents] = useState<FullScreenMessageEvent[]>([]);
  const [currentMessage, setCurrentMessage] = useState<FullScreenMessageEvent | null>(null);

  useFullScreenMessageEvent((event) => {
    setEvents((prevEvents) =>
      event.messageId && prevEvents.find((prevEvent) => prevEvent.messageId === event.messageId)
        ? [...prevEvents.map((prevEvent) => (prevEvent.messageId === event.messageId ? event : prevEvent))]
        : [event, ...prevEvents],
    );
  });

  // Sort events so actionable messages have higher priority
  const sortedEvents = events.sort((a, b) => {
    if (a.actions && !b.actions) return -1;
    if (!a.actions && b.actions) return 1;
    return a.startTimestamp - b.startTimestamp;
  });

  useFullScreenMessageActionEvent((event) => {
    setEvents((prevEvents) => prevEvents.filter((prevEvent) => prevEvent.messageId !== event.messageId));
  });

  useEffect(() => {
    const activeEvent = sortedEvents.find(
      (event) => event.startTimestamp <= worldState.timestamp && event.endTimestamp > worldState.timestamp,
    );
    setCurrentMessage(activeEvent || null);
  }, [sortedEvents, worldState.timestamp]);

  if (!currentMessage) {
    return null;
  }

  const getMessageState = (event: FullScreenMessageEvent, timestamp: number) => {
    if (timestamp < event.startTimestamp) return 'pre';
    if (timestamp < event.startTimestamp + 0.5) return 'pre-in';
    if (timestamp > event.endTimestamp - 0.5) return 'post-in';
    if (timestamp > event.endTimestamp) return 'post';
    return 'active';
  };

  const messageState = getMessageState(currentMessage, worldState.timestamp);

  const renderMessage = (message: string | string[]) => {
    return Array.isArray(message) ? message.map((line, index) => <div key={index}>{line}</div>) : message;
  };

  return (
    <FullScreenMessageContainer
      data-message-state={messageState}
      data-action={!!((currentMessage.actions?.length ?? 0) > 0)}
    >
      <MessageText>{renderMessage(currentMessage.message)}</MessageText>
      {currentMessage.prompt && currentMessage.actions && (
        <ActionContainer>
          {currentMessage.actions.map((action, index) => (
            <ActionButton
              key={index}
              onClick={() => dispatchFullScreenMessageAction(currentMessage.messageId, action.id)}
            >
              {action.text}
            </ActionButton>
          ))}
        </ActionContainer>
      )}
    </FullScreenMessageContainer>
  );
}

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`;

const FullScreenMessageContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  text-shadow: 0px 0px 10px black;
  &:not([data-action='true']) {
    pointer-events: none;
  }
  z-index: 1;

  &[data-message-state='pre'] {
    display: none;
  }

  &[data-message-state='pre-in'] {
    display: flex;
    animation: ${fadeIn} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${fadeOut} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`;

const MessageText = styled.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`;

const ActionContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`;

const ActionButton = styled.button`
  font-size: 2rem;
  padding: 1rem 2rem;
  margin: 0 1rem;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.4);
  }
`;
