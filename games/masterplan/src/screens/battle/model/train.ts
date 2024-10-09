import { allPlans } from '../../designer/plans';
import { unitsToModelInput } from './convert';
import { simulate } from './simulate';
import { loadModel, saveModel, train } from './tf';
import { ModelInput } from './types';

loadModel().then(async () => {
  const simulationResults: [winnerPlan: ModelInput, loserPlan: ModelInput][] = [];

  let todoCounter = allPlans.length ** 2 - allPlans.length;
  for (const plan of allPlans) {
    const planModelInput = unitsToModelInput(plan.units);

    for (const counterPlan of allPlans) {
      if (plan.name === counterPlan.name) {
        continue;
      }

      const counterPlanModelInput = unitsToModelInput(counterPlan.units);

      const battleResult = simulate(plan.units, counterPlan.units);
      const oppositeResult = simulate(counterPlan.units, plan.units);
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
        simulationResults.push([planModelInput, counterPlanModelInput]);
      }
      if (battleResult === 'counterPlan' || battleResult === 'draw') {
        simulationResults.push([counterPlanModelInput, planModelInput]);
      }
    }
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
