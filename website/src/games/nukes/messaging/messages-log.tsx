import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { MessageEvent, useMessageEvent, useMessageActionEvent, dispatchMessageAction } from './messages';

interface WorldState {
  timestamp: number;
}

/** UI component that displays the log of messages */
export function MessagesLog({ worldState }: { worldState: WorldState }) {
  const [events, setEvents] = useState<MessageEvent[]>([]);

  useMessageEvent((event) => {
    setEvents((prevEvents) =>
      event.messageId && prevEvents.find((prevEvent) => prevEvent.messageId === event.messageId)
        ? [...prevEvents.map((prevEvent) => (prevEvent.messageId === event.messageId ? event : prevEvent))]
        : [event, ...prevEvents],
    );
  });
  useMessageActionEvent((event) => {
    setEvents((prevEvents) => prevEvents.filter((prevEvent) => prevEvent.messageId !== event.messageId));
  });

  const renderMessage = (message: string | string[]) => {
    return Array.isArray(message) ? message.map((line, index) => <div key={index}>{line}</div>) : message;
  };

  const calculateOpacity = (eventTime: number, currentTime: number) => {
    const oneMinuteInMilliseconds = 60;
    const tenSecondsInMilliseconds = 10;
    const age = currentTime - eventTime;
    if (age > oneMinuteInMilliseconds) return 0;
    if (age > oneMinuteInMilliseconds - tenSecondsInMilliseconds) {
      return 1 - (age - (oneMinuteInMilliseconds - tenSecondsInMilliseconds)) / tenSecondsInMilliseconds;
    }
    return 1;
  };

  const filteredEvents = useMemo(() => {
    const currentTime = worldState.timestamp;
    const oneMinuteInMilliseconds = 60;
    return events
      .filter((event) => {
        const eventTime = event.startTimestamp || 0;
        return currentTime - eventTime <= oneMinuteInMilliseconds;
      })
      .map((event) => ({
        ...event,
        opacity: calculateOpacity(event.startTimestamp || 0, currentTime),
      }));
  }, [events, worldState.timestamp]);

  return (
    <MessageLogContainer>
      {filteredEvents.map((event, index) => (
        <MessageItem key={index} style={{ opacity: event.opacity }}>
          <div>{renderMessage(event.message)}</div>
          {event.prompt && event.actions && (
            <ActionContainer>
              {event.actions.map((action, actionIndex) => (
                <ActionButton key={actionIndex} onClick={() => dispatchMessageAction(event.messageId, action.id)}>
                  {action.text}
                </ActionButton>
              ))}
            </ActionContainer>
          )}
        </MessageItem>
      ))}
    </MessageLogContainer>
  );
}

const MessageLogContainer = styled.div`
  position: fixed;
  right: 0;
  max-height: 100%;
  bottom: 0;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 10px;
  display: flex;
  flex-direction: column-reverse;
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`;

const MessageItem = styled.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`;

const ActionContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`;

const ActionButton = styled.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;
