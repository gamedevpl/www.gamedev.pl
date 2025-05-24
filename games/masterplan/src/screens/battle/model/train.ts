import { allPlans } from '../../designer/plans';
import { unitsToModelInput } from './convert-input';
import { unitsToModelOutput } from './convert-output';
import { simulate } from './simulate';
import { loadModel, saveModel, train } from './tf';
import { ModelInput, ModelOutput } from './types';
import { generateMasterplan } from './infer';
import { rotateUnits, Unit } from '../../designer/designer-types';
import { trimUnits } from './units-trim';
import { getCache } from './cache';
import { generateTerrain } from '../game/terrain/terrain-generator';
import { SOLDIER_WIDTH } from '../consts';

const params = process.argv.slice(2);

if (params.includes('--help')) {
  console.log(`
Usage: node train.ts [options]

Options:
  --gen-count=<number>  Number of generations to simulate (default: 5)
  --plan-count=<number> Number of plans to use from hardcoded list (default: all plans)
  --new-model           Train a new model from scratch
  --epochs=<number>     Number of epochs for training (default: 50)
  --help                Display this help message
  `);
  process.exit(0);
}

let genCount = parseInt(params.find((p) => p.startsWith('--gen-count='))?.split('=')[1] || '5', 10);
const planCount = parseInt(
  params.find((p) => p.startsWith('--plan-count='))?.split('=')[1] || String(allPlans.length),
  10,
);
const newModel = params.includes('--new-model');
const epochs = parseInt(params.find((p) => p.startsWith('--epochs='))?.split('=')[1] || '50', 10);

console.log('Training with', genCount, 'generations and', planCount, 'plans', newModel ? 'with new model' : '');

loadModel(newModel).then(async () => {
  const simulationResults: [loserPlan: ModelInput, winnerPlan: ModelOutput][] = [];

  const getTerrainData = () => generateTerrain(SOLDIER_WIDTH);

  // First we generate some plans using LLM
  let bestPlan = allPlans[0].units;
  const bestPlanName = allPlans[0].name;

  const { readCache, writeCache } = getCache<
    {
      name: string;
      units: Unit[];
      result: 'won' | 'lost' | 'drawed';
      reasoning?: string;
      changes?: string;
    }[]
  >('result-chain.cache.json', []);
  let resultChain = readCache();

  if (resultChain.length === 0) {
    resultChain = [{ name: bestPlanName, units: rotateUnits(bestPlan), result: 'won' }];
  } else {
    console.log('Loaded existing resultChain from cache');
    bestPlan = resultChain[resultChain.length - 1].units;
  }

  while (resultChain.length < genCount) {
    const terrainData = getTerrainData();
    const generation = await generateMasterplan(resultChain);
    const counterPlan = trimUnits(generation.units, 104);
    const battleResult = simulate(rotateUnits(bestPlan), counterPlan, terrainData);
    const oppositeResult = simulate(rotateUnits(counterPlan), bestPlan, terrainData);

    const instableResult =
      (battleResult === 'plan' && oppositeResult === 'plan') ||
      (battleResult === 'draw' && oppositeResult !== 'draw') ||
      (oppositeResult === 'draw' && battleResult !== 'draw');

    if (instableResult) {
      console.log('Skipping instable result');
      genCount--;
      continue;
    }

    const result = battleResult === 'plan' ? 'lost' : battleResult === 'counterPlan' ? 'won' : 'drawed';
    resultChain.push({ ...generation, units: counterPlan, result });
    bestPlan = counterPlan;

    // Cache the updated resultChain after each generation
    writeCache(resultChain);
  }

  // Lets simulate some more battles with LLM generated plans, and the hardcoded plans
  const wins = new Map<string, number>();

  let todoCounter =
    Math.min(allPlans.length, planCount) *
      (Math.min(allPlans.length, planCount) + resultChain.slice(0, genCount).length) -
    Math.min(allPlans.length, planCount);
  for (const plan of [...allPlans.slice(0, planCount), ...resultChain.slice(0, genCount).map((result) => result)]) {
    for (const counterPlan of allPlans.slice(0, planCount)) {
      if (plan.name === counterPlan.name) {
        continue;
      }

      const terrainData = getTerrainData();

      const battleResult = simulate(rotateUnits(plan.units), counterPlan.units, terrainData);
      const oppositeResult = simulate(rotateUnits(counterPlan.units), plan.units, terrainData);
      const instableResult =
        (battleResult === 'plan' && oppositeResult === 'plan') ||
        (battleResult === 'draw' && oppositeResult !== 'draw') ||
        (oppositeResult === 'draw' && battleResult !== 'draw');
      console.log(
        todoCounter--,
        plan.name,
        battleResult === 'plan' ? '>' : battleResult === 'counterPlan' ? '<' : '=',
        counterPlan.name,
        instableResult ? '!' : '',
      );
      if (instableResult) {
        continue;
      }

      if (battleResult === 'plan' || battleResult === 'draw') {
        simulationResults.push([
          unitsToModelInput(rotateUnits(counterPlan.units), terrainData),
          unitsToModelOutput(plan.units),
        ]);
      }
      if (battleResult === 'counterPlan' || battleResult === 'draw') {
        simulationResults.push([
          unitsToModelInput(rotateUnits(plan.units), terrainData),
          unitsToModelOutput(counterPlan.units),
        ]);
      }

      if (battleResult === 'plan') {
        wins.set(plan.name, (wins.get(plan.name) || 0) + 1);
      } else if (battleResult === 'counterPlan') {
        wins.set(counterPlan.name, (wins.get(counterPlan.name) || 0) + 1);
      }
    }
  }

  console.log('Simulation finished, the best plan is:', [...wins.entries()].reduce((a, b) => (a[1] > b[1] ? a : b))[0]);

  // Train the model
  await train(
    simulationResults.map(([loserInput]) => loserInput),
    simulationResults.map(([, winnerOutput]) => winnerOutput),
    epochs,
  );

  // Save the model
  await saveModel();
});
