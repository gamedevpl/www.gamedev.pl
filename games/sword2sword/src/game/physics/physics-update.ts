import { PhysicsState } from './physics-types';

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number): PhysicsState {
  // apply input actions

  // perform step
  physicsState.world.timestep = timeDelta;
  physicsState.world.step();

  return physicsState;
}
