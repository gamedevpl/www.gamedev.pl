export type Position = { x: number; y: number };

export type Rect = { left: number; top: number; right: number; bottom: number };

export type StateId = string;

export type CityId = string;

export type LaunchSiteId = string;

export type MissileId = string;

export type SectorId = string;

export type ExplosionId = string;

export type State = {
  id: StateId;
  name: string;
};

export type City = {
  id: CityId;
  stateId: StateId;
  name: string;
  position: Position;
};

export enum SectorType {
  WATER = 'WATER',
  GROUND = 'GROUND',
}

export type Sector = {
  id: SectorId;
  rect: Rect;
  type: SectorType;
};

export type LaunchSite = {
  id: LaunchSiteId;
  position: Position;
  stateId?: StateId;
};

export type Missile = {
  id: MissileId;
  launch: Position;
  launchTimestamp: number;

  target: Position;
  targetTimestamp: number;
};

export type Explosion = {
  id: ExplosionId;
  startTimestamp: number;
  endTimestamp: number;
  position: Position;
  radius: number;
};

export type WorldState = {
  timestamp: number;

  states: State[];
  cities: City[];
  launchSites: LaunchSite[];

  sectors: Sector[];

  missiles: Missile[];
  explosions: Explosion[];
};
