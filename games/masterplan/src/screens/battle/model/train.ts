import { allPlans } from '../../designer/plans';
import { unitsToModelInput } from './convert';
import { simulate } from './simulate';
import { loadModel, saveModel, train } from './tf';
import { ModelInput } from './types';
import { generateMasterplan } from './infer';
import { rotateUnits, Unit } from '../../designer/designer-types';
import { trimUnits } from './units-trim';
import { getCache } from './cache';

const params = process.argv.slice(2);

let genCount = parseInt(params.find((p) => p.startsWith('--gen-count='))?.split('=')[1] || '5', 10);
const planCount = parseInt(
  params.find((p) => p.startsWith('--plan-count='))?.split('=')[1] || String(allPlans.length),
  10,
);
const newModel = params.includes('--new-model');
const epochs = parseInt(params.find((p) => p.startsWith('--epochs='))?.split('=')[1] || '50', 10);

console.log('Training with', genCount, 'generations and', planCount, 'plans', newModel ? 'with new model' : '');

loadModel(newModel).then(async () => {
  const simulationResults: [winnerPlan: ModelInput, loserPlan: ModelInput][] = [];
  const wins = new Map<string, number>();

  let todoCounter = allPlans.length ** 2 - allPlans.length;
  for (const plan of allPlans.slice(0, planCount)) {
    for (const counterPlan of allPlans.slice(0, planCount)) {
      if (plan.name === counterPlan.name) {
        continue;
      }

      const battleResult = simulate(rotateUnits(plan.units), counterPlan.units);
      const oppositeResult = simulate(rotateUnits(counterPlan.units), plan.units);
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
        simulationResults.push([unitsToModelInput(rotateUnits(counterPlan.units)), unitsToModelInput(plan.units)]);
      }
      if (battleResult === 'counterPlan' || battleResult === 'draw') {
        simulationResults.push([unitsToModelInput(rotateUnits(plan.units)), unitsToModelInput(counterPlan.units)]);
      }
      if (battleResult === 'plan') {
        wins.set(plan.name, (wins.get(plan.name) || 0) + 1);
      } else if (battleResult === 'counterPlan') {
        wins.set(counterPlan.name, (wins.get(counterPlan.name) || 0) + 1);
      }
    }
  }

  const bestPlanName = [...wins.entries()].reduce((a, b) => (a[1] > b[1] ? a : b))[0];
  let bestPlan = allPlans.find((plan) => plan.name === bestPlanName)!.units;

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
    const generation = await generateMasterplan(resultChain);
    const counterPlan = trimUnits(generation.units, 104);
    const battleResult = simulate(rotateUnits(bestPlan), counterPlan);
    const oppositeResult = simulate(rotateUnits(counterPlan), bestPlan);

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

  for (let i = 1; i < resultChain.length; i++) {
    const battleResult = resultChain[i].result;
    const bestPlan = resultChain[i - 1].units;
    const counterPlan = resultChain[i].units;
    if (battleResult === 'won') {
      simulationResults.push([unitsToModelInput(rotateUnits(bestPlan)), unitsToModelInput(counterPlan)]);
    } else if (battleResult === 'lost') {
      simulationResults.push([unitsToModelInput(rotateUnits(counterPlan)), unitsToModelInput(bestPlan)]);
    }
  }

  await train(
    simulationResults.map(([, loserPlan]) => loserPlan),
    simulationResults.map(([winnerPlan]) => winnerPlan),
    epochs,
  );

  await saveModel();
});
