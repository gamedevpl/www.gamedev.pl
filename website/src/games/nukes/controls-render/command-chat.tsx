import { useState } from 'react';
import { CityId, LaunchSiteId, MissileId, StateId, WorldState, State, Strategy } from '../world/world-state-types';
import styled from 'styled-components';

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

  return (
    <ChatContainer>
      <input
        type="text"
        placeholder="Chat with commander"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const input = event.target as HTMLInputElement;
            const message = input.value;
            if (!message) {
              return;
            }

            input.value = '';
            const command = matchCommand(message, playerState, worldState);

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
        }}
      />
      <div>
        {log.map((entry) => (
          <p>{entry.message}</p>
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

type ChatEntry = {
  timestamp: number;
  role: 'user' | 'commander';
  message: string;
  command?: CommandPayload;
};

enum CommandType {
  ATTACK_STATE,
  ATTACK_CITY,
  ATTACK_LAUNCH_SITE,
  ATTACK_MISSILE,
}

type CommandPayload =
  | {
      type: CommandType.ATTACK_STATE;
      stateId: StateId;
    }
  | {
      type: CommandType.ATTACK_CITY;
      cityId: CityId;
    }
  | {
      type: CommandType.ATTACK_LAUNCH_SITE;
      stateId: LaunchSiteId;
    }
  | {
      type: CommandType.ATTACK_MISSILE;
      stateId: MissileId;
    };

type SentenceMap = Record<string, CommandPayload>;

function matchCommand(input: string, playerState: State, worldState: WorldState): CommandPayload | undefined {
  const sentenceMap = generateCommandSentences(playerState, worldState);

  return sentenceMap[input];
}

function executeCommand(
  command: CommandPayload,
  playerState: State,
  worldState: WorldState,
  setWorldState: (worldState: WorldState) => void,
): ChatEntry | undefined {
  switch (command.type) {
    case CommandType.ATTACK_STATE: {
      const state = worldState.states.find((state) => state.id === command.stateId);
      if (!state) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: "I don't understand who should be attacked",
        };
      } else if (playerState.strategies[command.stateId] === Strategy.HOSTILE) {
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: 'We are already attacking ' + state.name,
        };
      } else {
        playerState.strategies[command.stateId] = Strategy.HOSTILE;
        setWorldState({ ...worldState, states: worldState.states });
        return {
          timestamp: worldState.timestamp,
          role: 'commander',
          message: 'Affirmative, attacking ' + state.name,
        };
      }
    }
    case CommandType.ATTACK_CITY:
      console.log('attack city', command.cityId);
      break;
    case CommandType.ATTACK_LAUNCH_SITE:
      console.log('attack launch site', command.stateId);
      break;
    case CommandType.ATTACK_MISSILE:
      console.log('attack missile', command.stateId);
      break;
  }

  return undefined;
}

function generateCommandSentences(playerState: State, worldState: WorldState): SentenceMap {
  const result: SentenceMap = {};

  for (const state of worldState.states.filter((state) => state.id !== playerState.id)) {
    result['attack ' + state.name] = { type: CommandType.ATTACK_STATE, stateId: state.id };
  }

  for (const city of worldState.cities.filter((city) => city.stateId !== playerState.id)) {
    result['attack ' + city.name] = { type: CommandType.ATTACK_STATE, stateId: city.id };
  }

  return result;
}
