import { predict } from './tf-browser';
import { Unit } from '../../designer/designer-types';
import { modelInputToUnits, unitsToModelInput } from './convert';
import { countSoldiers, trimUnits } from './units-trim';
import { consolidateUnits } from './units-consolidate';

export async function predictCounterPlan(playerPlan: Unit[]): Promise<Unit[]> {
  const modelInput = unitsToModelInput(playerPlan);
  const modelOutput = await predict(modelInput);
  return trimUnits(consolidateUnits(modelInputToUnits(modelOutput)), countSoldiers(playerPlan));
}
