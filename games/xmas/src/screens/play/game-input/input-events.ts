export enum GameEvents {
  CREATE_FIREBALL = 'game:create-fireball',
  UPDATE_FIREBALL = 'game:update-fireball',
}

export type CreateFireballEvent = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type UpdateFireballEvent = {
  id: string;
  x: number;
  y: number;
  radius: number;
};