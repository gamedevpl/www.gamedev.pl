import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { FullScreenMessageEvent, useFullScreenMessageEvent } from './full-screen-messages';

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

/** UI component that displays the log of messages */
export function MessagesLog() {
  const [events, setEvents] = useState<FullScreenMessageEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useFullScreenMessageEvent((event) => {
    setEvents((prevEvents) =>
      event.messageId && prevEvents.find((prevEvent) => prevEvent.messageId === event.messageId)
        ? [...prevEvents.map((prevEvent) => (prevEvent.messageId === event.messageId ? event : prevEvent))]
        : [event, ...prevEvents],
    );
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const renderMessage = (message: string | string[]) => {
    return Array.isArray(message) ? message.map((line) => <div>{line}</div>) : message;
  };

  return (
    <MessageLogContainer>
      {events.map((event, index) => (
        <MessageItem key={index}>
          <div>{renderMessage(event.message)}</div>
        </MessageItem>
      ))}
      <div ref={bottomRef} />
    </MessageLogContainer>
  );
}
