import { useState } from 'react';
import styled from 'styled-components';
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

import { CityId, LaunchSiteId, MissileId, StateId, WorldState, State, Strategy } from '../world/world-state-types';

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
        onKeyDown={async (event) => {
          if (event.key === 'Enter') {
            const input = event.target as HTMLInputElement;
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
        }}
      />
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

async function matchCommand(
  input: string,
  playerState: State,
  worldState: WorldState,
): Promise<CommandPayload | undefined> {
  const sentenceMap = generateCommandSentences(playerState, worldState);

  const match = await findMostSimilarSentence(input.toLowerCase(), Object.keys(sentenceMap));

  return match ? sentenceMap[match] : undefined;
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
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: "I don't know how to attack cities.",
      };
    case CommandType.ATTACK_LAUNCH_SITE:
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: "I don't know how to attack launch sites.",
      };
    case CommandType.ATTACK_MISSILE:
      return {
        timestamp: worldState.timestamp,
        role: 'commander',
        message: "I don't know how to attack missiles.",
      };
  }
}

function generateCommandSentences(playerState: State, worldState: WorldState): SentenceMap {
  const result: SentenceMap = {};

  for (const state of worldState.states.filter((state) => state.id !== playerState.id)) {
    ATTACK_STATE_TEMPLATES.forEach((template) => {
      result[template.replace('$STATE_NAME', state.name).toLowerCase()] = {
        type: CommandType.ATTACK_STATE,
        stateId: state.id,
      };
    });
  }

  for (const city of worldState.cities.filter((city) => city.stateId !== playerState.id)) {
    result['attack ' + city.name] = { type: CommandType.ATTACK_CITY, cityId: city.id };
  }

  return result;
}

const ATTACK_STATE_TEMPLATES = [
  'attack $STATE_NAME',
  'declare war on $STATE_NAME',
  'start attacking $STATE_NAME',
  'initiate hostilities with $STATE_NAME',
  'begin offensive against $STATE_NAME',
  'launch assault on $STATE_NAME',
  'commence attack on $STATE_NAME',
  'start war with $STATE_NAME',
  'engage $STATE_NAME in combat',
  'strike $STATE_NAME',
  'atack $STATE_NAME', // Common typo
  'attck $STATE_NAME', // Another common typo
  'attak $STATE_NAME', // Another common typo
  'destroy $STATE_NAME',
  'eliminate $STATE_NAME',
  'target $STATE_NAME',
  'go to war with $STATE_NAME',
  'start conflict with $STATE_NAME',
  'invade $STATE_NAME',
  'assault $STATE_NAME',
];

// Load the Universal Sentence Encoder model
const model = await use.load();

async function findMostSimilarSentence(input: string, sentences: string[]) {
  const inputEmbedding = (await model.embed([input])).arraySync();

  let closestSentence = '';
  let closestScore = 0.7; // this is the threshold, may be wrong

  for (const sentence of sentences) {
    const sentenceEmbedding = (await model.embed([sentence])).arraySync();

    const dotProduct = tf.matMul(inputEmbedding, tf.transpose(sentenceEmbedding));
    const norm1 = tf.norm(inputEmbedding);
    const norm2 = tf.norm(sentenceEmbedding);

    const score = dotProduct.div(tf.mul(norm1, norm2)).dataSync()[0];

    if (score > closestScore) {
      closestScore = score;
      closestSentence = sentence;
    }
  }

  return closestSentence;
}
