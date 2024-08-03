import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { dispatchCustomEvent, useCustomEvent } from '../events';
import { WorldState } from '../world/world-state-types';

const CUSTOM_EVENT_NAME = 'fullScreenMessage';

/** Full screen message event payload */
export interface FullScreenMessageEvent {
  message: string | string[];
  startTimestamp: number;
  endTimestamp: number;
  messageId: string;
}

/** Display a full screen message */
export function dispatchFullScreenMessage(
  message: string | string[],
  startTimestamp: number,
  endTimestamp: number,
  messageId = '',
) {
  dispatchCustomEvent<FullScreenMessageEvent>(CUSTOM_EVENT_NAME, { message, startTimestamp, endTimestamp, messageId });
}

/** Hook for handling full screen messages */
export function useFullScreenMessageEvent(callback: (event: FullScreenMessageEvent) => void) {
  useCustomEvent<FullScreenMessageEvent>(CUSTOM_EVENT_NAME, (event) => {
    callback(event);
  });
}

/** A component that displays the most recent full screen message */
export function FullScreenMessages({ worldState }: { worldState: WorldState }) {
  const [events, setEvents] = useState<FullScreenMessageEvent[]>([]);
  const [currentMessage, setCurrentMessage] = useState<FullScreenMessageEvent | null>(null);

  useFullScreenMessageEvent((event) => {
    setEvents((prevEvents) =>
      (event.messageId && prevEvents.find((prevEvent) => prevEvent.messageId === event.messageId)
        ? [...prevEvents.map((prevEvent) => (prevEvent.messageId === event.messageId ? event : prevEvent))]
        : [event, ...prevEvents]
      ).filter((event) => event.endTimestamp > worldState.timestamp),
    );
  });

  const getMessageState = (event: FullScreenMessageEvent, timestamp: number) => {
    if (timestamp < event.startTimestamp) return 'pre';
    if (timestamp < event.startTimestamp + 0.5) return 'pre-in';
    if (timestamp > event.endTimestamp - 0.5) return 'post-in';
    if (timestamp > event.endTimestamp) return 'post';
    return 'active';
  };

  useEffect(() => {
    const activeEvent = events.find(
      (event) => event.startTimestamp <= worldState.timestamp && event.endTimestamp > worldState.timestamp,
    );

    setCurrentMessage(activeEvent ? activeEvent : null);
  }, [events, worldState.timestamp]);

  if (!currentMessage) {
    return null;
  }
  const activeEvent = events.find(
    (event) => event.startTimestamp <= worldState.timestamp && event.endTimestamp > worldState.timestamp,
  );

  const messageState = activeEvent ? getMessageState(activeEvent, worldState.timestamp) : 'none';

  const renderMessage = (message: string | string[]) => {
    return Array.isArray(message) ? message.map((line, index) => <div key={index}>{line}</div>) : message;
  };

  return (
    <FullScreenMessageContainer data-message-state={messageState}>
      <MessageText>{renderMessage(currentMessage.message)}</MessageText>
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
  text-shadow: 0px 0px 10px black;
  pointer-events: none;

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
  /* animation:
    ${fadeIn} 0.5s ease-in-out forwards,
    ${fadeOut} 0.5s ease-in-out forwards 2.5s; */
  white-space: pre-line;
`;
