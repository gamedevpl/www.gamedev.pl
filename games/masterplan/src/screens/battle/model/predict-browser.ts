import { predict } from './tf-browser';
import { Unit } from '../../designer/designer-types';
import { unitsToModelInput } from './convert-input';
import { modelOutputToUnits } from './convert-output';
import { countSoldiers, trimUnits } from './units-trim';
import { consolidateUnits } from './units-consolidate';
import { TerrainData } from '../game/terrain/terrain-generator';

export async function predictCounterPlan(playerPlan: Unit[], terrainData: TerrainData): Promise<Unit[]> {
  const modelInput = unitsToModelInput(playerPlan, terrainData);
  const modelOutput = await predict(modelInput);
  return trimUnits(consolidateUnits(modelOutputToUnits(modelOutput)), countSoldiers(playerPlan));
}
