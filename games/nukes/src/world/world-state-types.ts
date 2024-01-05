export type Position = { x: Number; y: Number; z: Number };

export type State = {
  id: string;
  name: string;
  border: Position[];
};

export type City = {
  id: string;
  name: string;
  position: Position;
  size: Number;
};

export type LaunchSite = {
  position: Position;
};

export type Missile = {
  startTimestamp: Number;
  start: Position;
  position: Position;
  target: Position;
};

export type Explosion = {
  startTimestamp: Number;
  position: Position;
};

export type WorldState = {
  timestamp: Number;

  states: State[];
  cities: City[];
  launchSites: LaunchSite[];

  missiles: Missile[];
  explosion: Explosion[];
};
