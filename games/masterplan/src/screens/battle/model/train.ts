import { allPlans } from '../../designer/plans';
import { unitsToModelInput } from './convert';
import { simulate } from './simulate';
import { loadModel, saveModel, train } from './tf';
import { ModelInput } from './types';
import { generateMasterplan } from './infer';
import { rotateUnits, Unit } from '../../designer/designer-types';
import { trimUnits } from './units-trim';

loadModel().then(async () => {
  const simulationResults: [winnerPlan: ModelInput, loserPlan: ModelInput][] = [];
  const wins = new Map<string, number>();

  let todoCounter = allPlans.length ** 2 - allPlans.length;
  for (const plan of allPlans) {
    for (const counterPlan of allPlans) {
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
  const resultChain: {
    name: string;
    units: Unit[];
    result: 'won' | 'lost' | 'drawed';
    reasoning?: string;
    changes?: string;
  }[] = [{ name: bestPlanName, units: rotateUnits(bestPlan), result: 'won' }];

  for (let i = 0; i < 5; i++) {
    const generation = await generateMasterplan(resultChain);
    const counterPlan = trimUnits(generation.units, 104);
    const battleResult = simulate(rotateUnits(bestPlan), counterPlan);
    const oppositeResult = simulate(rotateUnits(counterPlan), bestPlan);

    const instableResult =
      (battleResult === 'plan' && oppositeResult === 'plan') ||
      (battleResult === 'draw' && oppositeResult !== 'draw') ||
      (oppositeResult === 'draw' && battleResult !== 'draw');

    if (instableResult) {
      continue;
    }

    if (battleResult === 'counterPlan') {
      simulationResults.push([unitsToModelInput(rotateUnits(bestPlan)), unitsToModelInput(counterPlan)]);
      resultChain.push({ ...generation, units: counterPlan, result: 'lost' });
    } else if (simulate(counterPlan, bestPlan) === 'plan') {
      simulationResults.push([unitsToModelInput(rotateUnits(counterPlan)), unitsToModelInput(bestPlan)]);
      resultChain.push({ ...generation, units: counterPlan, result: 'won' });
    } else {
      resultChain.push({ ...generation, units: counterPlan, result: 'drawed' });
    }
    bestPlan = counterPlan;
  }

  await train(
    simulationResults.map(([, loserPlan]) => loserPlan),
    simulationResults.map(([winnerPlan]) => winnerPlan),
  );

  await saveModel();

  // loop

  // generate new plan

  // predict counter plan

  // simulate battle

  // train result
});
