import { Unit } from '../designer-types';
import { Plan } from '../plans';

export function selectPlan(playerUnits: Unit[], availablePlans: Plan[]): Unit[] {
  if (availablePlans.length === 0) {
    throw new Error('No AI plans available for selection');
  }

  // Calculate scores for each plan
  const planScores = availablePlans.map((plan) => ({
    plan,
    score: plan.probabilityScore(playerUnits),
  }));

  // Sort plans by score in descending order
  planScores.sort((a, b) => b.score - a.score);

  // Select the top plan
  const selectedPlan = planScores[0].plan;

  console.log('Selected plan:', selectedPlan.name, 'with score:', planScores[0].score);

  // Log all plan scores for debugging
  console.log('All plan scores:');
  planScores.forEach(({ plan, score }) => {
    console.log(`${plan.name}: ${score}`);
  });

  return selectedPlan.units;
}
