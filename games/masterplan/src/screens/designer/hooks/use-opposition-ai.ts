import { useState, useCallback } from 'react';
import { Unit } from '../designer-screen';
import { selectPlan } from '../utils/plan-selection';
import { allPlans, balancedAssault } from '../plans';

export const useOppositionAI = () => {
  const [oppositionPlan, setOppositionPlan] = useState<Unit[]>([]);

  const updateOppositionPlan = useCallback((playerPlan: Unit[]): Unit[] => {
    const selectedPlan = selectPlan(playerPlan, allPlans);
    setOppositionPlan(selectedPlan);
    return selectedPlan;
  }, []);

  return {
    oppositionPlan,
    generateOppositionPlan: () => balancedAssault.units, // Generate initial plan if needed
    updateOppositionPlan,
  };
};
