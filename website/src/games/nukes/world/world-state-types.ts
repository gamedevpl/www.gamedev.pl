/** Position and size */
export type Position = { x: number; y: number };

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Identifiers */
export type StateId = string;

export type CityId = string;

export type LaunchSiteId = string;

export type MissileId = string;

export type InterceptorId = string;

export type SectorId = string;

export type ExplosionId = string;

/** World structure */
export type State = {
  id: StateId;
  name: string;
  color: string;
  isPlayerControlled: boolean;
  strategies: Record<StateId, Strategy>;
  lastStrategyUpdate: number;
  generalStrategy: Strategy | undefined;
  population: number; // Field to store the total population of the state
};

export enum Strategy {
  NEUTRAL = 'NEUTRAL',
  FRIENDLY = 'FRIENDLY',
  HOSTILE = 'HOSTILE',
}

export type City = {
  id: CityId;
  stateId: StateId;
  name: string;
  position: Position;
  population: number;
};

export enum EntityType {
  LAUNCH_SITE = 'LAUNCH_SITE',
}

export enum SectorType {
  WATER = 'WATER',
  GROUND = 'GROUND',
}

export type Sector = {
  id: SectorId;
  position: Position;
  rect: Rect;
  type: SectorType;
  depth?: number; // water depth
  height?: number; // ground height
  stateId?: StateId; // New property to represent sector ownership
} & ({ cityId: CityId; population: number } | { population?: number; cityId?: CityId });

export enum LaunchSiteMode {
  ATTACK = 'ATTACK',
  DEFENCE = 'DEFENCE',
}

export type LaunchSite = {
  type: EntityType.LAUNCH_SITE;
  id: LaunchSiteId;
  position: Position;
  stateId: StateId;

  lastLaunchTimestamp?: number;
  nextLaunchTarget?: { type: 'position'; position: Position } | { type: 'missile'; missileId: MissileId };

  mode: LaunchSiteMode;
  modeChangeTimestamp?: number;
};

export type Missile = {
  id: MissileId;

  stateId: StateId;
  launchSiteId: LaunchSiteId;

  launch: Position;
  launchTimestamp: number;

  position: Position;

  target: Position;
  targetTimestamp: number;
};

export type Interceptor = {
  id: InterceptorId;

  stateId: StateId;
  launchSiteId: LaunchSiteId;

  launch: Position;
  launchTimestamp: number;

  position: Position;
  direction: number;
  tail: { timestamp: number; position: Position }[];

  targetMissileId: MissileId | undefined;

  maxRange: number;
};

export type Explosion = {
  id: ExplosionId;
  missileId: MissileId;
  startTimestamp: number;
  endTimestamp: number;
  position: Position;
  radius: number;
};

export type WorldState = {
  // timestamp in seconds
  timestamp: number;

  states: State[];
  cities: City[];
  launchSites: LaunchSite[];

  sectors: Sector[];

  missiles: Missile[];
  interceptors: Interceptor[];
  explosions: Explosion[];
};
