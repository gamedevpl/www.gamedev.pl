import React, { useState } from 'react';
import styled from 'styled-components';
import { State, WorldState } from '../world/world-state-types';
import { matchCommand, executeCommand } from '../commands/command-logic';
import { ChatEntry } from '../commands/command-types';

export function CommandChat({
  playerState,
  worldState,
  setWorldState,
}: {
  playerState: State;
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  const [log, setLog] = useState<ChatEntry[]>([]);

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const input = event.currentTarget;
      const message = input.value;
      if (!message) {
        return;
      }

      input.value = '';
      const command = await matchCommand(message, playerState, worldState);

      if (command) {
        const entry = executeCommand(command, playerState, worldState, setWorldState);

        setLog([
          ...log,
          {
            timestamp: worldState.timestamp,
            role: 'user',
            message,
            command,
          },
          ...(entry ? [entry] : []),
        ]);
      } else {
        setLog([
          ...log,
          {
            timestamp: worldState.timestamp,
            role: 'user',
            message,
          },
          {
            timestamp: worldState.timestamp,
            role: 'commander',
            message: "I don't understand",
          },
        ]);
      }
    }
  };

  return (
    <ChatContainer>
      <input type="text" placeholder="Chat with commander" onKeyDown={handleKeyDown} />
      <div>
        {log.map((entry, idx) => (
          <p key={idx + entry.message}>{entry.message}</p>
        ))}
      </div>
    </ChatContainer>
  );
}

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column-reverse;
  max-height: 200px;
  width: 350px;
  overflow: auto;
  border-top: 2px solid rgb(0, 255, 0);
  padding-top: 10px;
  margin-top: 10px;
  padding-right: 10px;

  > div {
    display: flex;
    flex-direction: column;
    flex-grow: 1;

    > p {
      display: block;
      text-align: left;
      margin: 0;
      padding: 0;
      padding-bottom: 5px;
    }
  }

  > input {
    display: flex;

    flex-grow: 0;
    flex-shrink: 0;

    background: none;
    border: none;
    color: white;
    outline: none;
    font-size: inherit;
    padding: 0;
  }
`;
