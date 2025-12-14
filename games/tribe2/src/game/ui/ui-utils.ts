import { GameWorldState } from '../world-types';

export function updateUI(world: GameWorldState) {
  if (world.selectedBuildingType && world.selectedBuildingType !== 'removal') {
    world.autopilotControls.activeAutopilotAction = undefined;
    world.autopilotControls.hoveredAutopilotAction = undefined;
  }
}
