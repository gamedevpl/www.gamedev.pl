import { StateId, CityId, LaunchSiteId, MissileId } from '../world/world-state-types';

export enum CommandType {
  ATTACK_STATE,
  ATTACK_CITY,
  ATTACK_LAUNCH_SITE,
  ATTACK_MISSILE,
}

export type CommandPayload =
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

export type ChatEntry = {
  timestamp: number;
  role: 'user' | 'commander';
  message: string;
  command?: CommandPayload;
};

export type SentenceMap = Record<string, CommandPayload>;
