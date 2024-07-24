/** Position and size */
export type Position = { x: number; y: number };

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Identifiers */
export type StateId = string;

export type CityId = string;

export type LaunchSiteId = string;

export type MissileId = string;

export type SectorId = string;

export type ExplosionId = string;

/** Histogram */
export type HistogramEntry<T> = { timestamp: number } & T;

/** World structure */
export type State = {
  id: StateId;
  name: string;
  isPlayerControlled: boolean;
  strategies: Record<StateId, Strategy>;
};

export enum Strategy {
  NEUTRAL = "NEUTRAL",
  FRIENDLY = "FRIENDLY",
  HOSTILE = "HOSTILE",
}

export type City = {
  id: CityId;
  stateId: StateId;
  name: string;
  position: Position;
  populationHistogram: Array<HistogramEntry<{ population: number }>>;
};

export enum EntityType {
  LAUNCH_SITE = "LAUNCH_SITE",
}

export enum SectorType {
  WATER = "WATER",
  GROUND = "GROUND",
}

export type Sector = {
  id: SectorId;
  position: Position;
  rect: Rect;
  type: SectorType;
};

export type LaunchSite = {
  type: EntityType.LAUNCH_SITE;
  id: LaunchSiteId;
  position: Position;
  stateId: StateId;

  lastLaunchTimestamp?: number;
  nextLaunchTarget?: Position;
};

export type Missile = {
  id: MissileId;

  stateId: StateId;
  launchSiteId: LaunchSiteId;

  launch: Position;
  launchTimestamp: number;

  target: Position;
  targetTimestamp: number;
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
  explosions: Explosion[];
};
