/**
 * Game Types - Basic game state and entity definitions
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  color: string;
}

export interface GameState {
  // Game time
  time: number; // in seconds
  isPaused: boolean;

  // World dimensions
  worldWidth: number;
  worldHeight: number;

  // Entities
  entities: Entity[];

  // Camera/viewport
  viewportCenter: Vector2D;

  // Input state
  mousePosition?: Vector2D;
  keysPressed: Set<string>;

  // Sound settings
  isMuted: boolean;
  masterVolume: number;
}
