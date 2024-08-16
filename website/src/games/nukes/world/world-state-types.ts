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

export type UnitId = string;

/** World structure */
export type State = {
  id: StateId;
  name: string;
  color: string;
  isPlayerControlled: boolean;
  strategies: Record<StateId, Strategy>;
  lastStrategyUpdate: number;
  generalStrategy: Strategy | undefined;
  population: number; // thousands of inhabitiants, this number is auto calculated
  defenceLines: DefenceLine[]; // New property for strategic defence lines
  currentDefenceLineIndex: number; // Index of the current active defence line
  lastDefenceEvaluationTimestamp: number; // Timestamp of the last defence line evaluation
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
  population: number; // thousands of inhabitiants, this number is auto calculated
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
  stateId?: StateId; // sector ownership
  cityId?: CityId;
  population: number; // thousands of inhabitiants
};

export type Unit = {
  id: UnitId;
  quantity: number;
  position: Position;
  rect: Rect;
  stateId: StateId; // unit belongs to a state
  order: UnitOrder; // current order
  lastOrderTimestamp?: number; // timestamp of the moment when the last order was given
};

export type UnitOrder =
  | {
      type: 'stay';
    }
  | { type: 'move'; targetPosition: Position; isFallback?: boolean };

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

export type Battle = {
  units: Array<Unit>;
  rect: Rect;
  position: Position; // Center position of the battle
  size: number; // Size of the battle (can be used for rendering)
};

export type Battles = Array<Battle>;

export type WorldState = {
  // timestamp in seconds
  timestamp: number;
  lastStrategyUpdateTimestamp?: number;
  lastLaunchGenerationTimestamp?: number;

  states: State[];
  cities: City[];
  launchSites: LaunchSite[];

  sectors: Sector[];

  units: Unit[];
  missiles: Missile[];
  interceptors: Interceptor[];
  explosions: Explosion[];
  battles: Battle[]; // New property to store current battles
};

// New type for strategic defence lines
export type DefenceLine = {
  id: string;
  sectors: Sector[];
  isBreach: boolean;
};
