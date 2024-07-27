import { State, WorldState, Strategy } from '../world/world-state-types';
import { CommandPayload, CommandType, ChatEntry, SentenceMap } from './command-types';
import { findMostSimilarSentence } from './similar-sentence';

export async function matchCommand(
  input: string,
  playerState: State,
  worldState: WorldState,
): Promise<CommandPayload | undefined> {
  const sentenceMap = generateCommandSentences(playerState, worldState);
  const match = await findMostSimilarSentence(input.toLowerCase(), Object.keys(sentenceMap));
  return match ? sentenceMap[match] : undefined;
}

export function executeCommand(
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
  'obliterate $STATE_NAME',
  'annihilate $STATE_NAME',
  'lay siege to $STATE_NAME',
  'wage war against $STATE_NAME',
  'initiate combat with $STATE_NAME',
  'open hostilities with $STATE_NAME',
  'commence offensive on $STATE_NAME',
  'begin siege of $STATE_NAME',
  'start military action against $STATE_NAME',
  'launch military campaign against $STATE_NAME',
  'nuke $STATE_NAME',
];
