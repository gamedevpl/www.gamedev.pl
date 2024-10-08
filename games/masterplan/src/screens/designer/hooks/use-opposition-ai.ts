import { useState, useCallback } from 'react';
import { Unit } from '../designer-types';
import { selectPlan } from '../utils/plan-selection';
import { allPlans, balancedAssault } from '../plans';
import { predictCounterPlan } from '../../battle/model/predict-browser';

export const useOppositionAI = () => {
  const [oppositionPlan, setOppositionPlan] = useState<Unit[]>([]);

  const updateOppositionPlan = useCallback(async (playerPlan: Unit[]): Promise<Unit[]> => {
    let selectedPlan: Unit[];

    try {
      selectedPlan = await predictCounterPlan(playerPlan);
      console.log('Generated counter plan using AI model');
    } catch (error) {
      console.error('Error predicting counter plan:', error);
      selectedPlan = selectPlan(playerPlan, allPlans);
      console.log('Fallback to pre-defined plan selection');
    }

    setOppositionPlan(selectedPlan);
    return selectedPlan;
  }, []);

  return {
    oppositionPlan,
    generateOppositionPlan: () => balancedAssault.units, // Generate initial plan if needed
    updateOppositionPlan,
  };
};
