import { MaterialType } from './constants';

/**
 * Type definitions for Bridge Builder game
 */

export interface Node {
  id: string;
  x: number;
  y: number;
  anchor: boolean;
}

export interface Beam {
  id: string;
  a: string; // node ID
  b: string; // node ID
  mat: MaterialType;
}

export interface Camera {
  x: number;
  y: number;
}

export interface Message {
  type: 'warn' | 'info';
  text: string;
}

export interface SimState {
  running: boolean;
  t: number;
  outcome: '' | 'win' | 'fail';
}

export type GameMode = 'build' | 'sim';
export type Tool = 'build' | 'delete';

export interface GameState {
  mode: GameMode;
  tool: Tool;
  mat: MaterialType;
  selectedNodeId: string | null;
  message: Message | null;
  simState: SimState;
  cam: Camera;
  nodes: Node[];
  beams: Beam[];
}
