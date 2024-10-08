import { predict } from './tf-browser';
import { Unit } from '../../designer/designer-types';
import { modelInputToUnits, unitsToModelInput } from './convert';

export async function predictCounterPlan(playerPlan: Unit[]): Promise<Unit[]> {
  const modelInput = unitsToModelInput(playerPlan);
  const modelOutput = await predict(modelInput);
  return modelInputToUnits(modelOutput);
}
