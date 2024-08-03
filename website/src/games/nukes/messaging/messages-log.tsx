import { useState } from 'react';
import styled from 'styled-components';
import {
  FullScreenMessageEvent,
  useFullScreenMessageEvent,
  useFullScreenMessageActionEvent,
  dispatchFullScreenMessageAction,
} from './messages';

/** UI component that displays the log of messages */
export function MessagesLog() {
  const [events, setEvents] = useState<FullScreenMessageEvent[]>([]);

  useFullScreenMessageEvent((event) => {
    setEvents((prevEvents) =>
      event.messageId && prevEvents.find((prevEvent) => prevEvent.messageId === event.messageId)
        ? [...prevEvents.map((prevEvent) => (prevEvent.messageId === event.messageId ? event : prevEvent))]
        : [event, ...prevEvents],
    );
  });
  useFullScreenMessageActionEvent((event) => {
    setEvents((prevEvents) => prevEvents.filter((prevEvent) => prevEvent.messageId !== event.messageId));
  });

  const renderMessage = (message: string | string[]) => {
    return Array.isArray(message) ? message.map((line) => <div>{line}</div>) : message;
  };

  return (
    <MessageLogContainer>
      {events.map((event, index) => (
        <MessageItem key={index}>
          <div>{renderMessage(event.message)}</div>
          {event.prompt && event.actions && (
            <ActionContainer>
              {event.actions.map((action, actionIndex) => (
                <ActionButton
                  key={actionIndex}
                  onClick={() => dispatchFullScreenMessageAction(event.messageId, action.id)}
                >
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
  top: 0;
  bottom: 0;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 14px;
  display: flex;
  flex-direction: column-reverse;
`;

const MessageItem = styled.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
`;

const ActionContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`;

const ActionButton = styled.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;
