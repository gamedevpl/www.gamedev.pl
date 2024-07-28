import { State, WorldState } from '../world/world-state-types';
import { CommandPayload, CommandType, SentenceMap } from './command-types';
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
    ATTACK_CITY_TEMPLATES.forEach((template) => {
      result[template.replace('$CITY_NAME', city.name.toLowerCase())] = {
        type: CommandType.ATTACK_CITY,
        cityId: city.id,
      };
    });
  }

  for (const launchSite of worldState.launchSites.filter((site) => site.stateId !== playerState.id)) {
    result['attack launch site ' + launchSite.id.toLowerCase()] = {
      type: CommandType.ATTACK_LAUNCH_SITE,
      launchSiteId: launchSite.id,
    };
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

const ATTACK_CITY_TEMPLATES = [
  'attack $CITY_NAME',
  'bomb $CITY_NAME',
  'launch missile at $CITY_NAME',
  'target $CITY_NAME',
  'strike $CITY_NAME',
  'hit $CITY_NAME',
  'destroy $CITY_NAME',
  'obliterate $CITY_NAME',
  'annihilate $CITY_NAME',
  'blast $CITY_NAME',
  'nuke $CITY_NAME',
  'fire at $CITY_NAME',
  'aim at $CITY_NAME',
  'assault $CITY_NAME',
  'bombard $CITY_NAME',
  'raid $CITY_NAME',
  'devastate $CITY_NAME',
  'eliminate $CITY_NAME',
  'launch attack on $CITY_NAME',
  'initiate strike on $CITY_NAME',
  'commence bombing of $CITY_NAME',
  'begin assault on $CITY_NAME',
];
