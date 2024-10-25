import { train } from './model/tf-browser';
import { unitsToModelInput } from './model/convert-input';
import { unitsToModelOutput } from './model/convert-output';
import { ModelInput, ModelOutput } from './model/types';
import { TerrainData } from './game/terrain/terrain-generator';
import { rotateUnits, Unit } from '../designer/designer-types';

// Function to train the model with battle results
export async function trainModel(
  winner: 'player' | 'opposition',
  playerUnits: Unit[],
  oppositionUnits: Unit[],
  terrainData: TerrainData,
) {
  try {
    const { inputs, outputs } = prepareBattleDataForTraining(winner, playerUnits, oppositionUnits, terrainData);

    await train(inputs, outputs, {
      epochs: 10,
      batchSize: 32,
      learningRate: 0.001,
      onProgress: (epoch, logs) => {
        console.log(`Training progress - Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}`);
      },
    });

    console.log('Model training completed successfully');
  } catch (error) {
    console.error('Failed to train model:', error);
  }
}

// Function to prepare battle data for training
function prepareBattleDataForTraining(
  winner: 'player' | 'opposition',
  playerUnits: Unit[],
  oppositionUnits: Unit[],
  terrainData: TerrainData,
): { inputs: ModelInput[]; outputs: ModelOutput[] } {
  const inputs: ModelInput[] = [];
  const outputs: ModelOutput[] = [];

  // Convert initial state to model input
  const input = unitsToModelInput(winner === 'player' ? rotateUnits(oppositionUnits) : playerUnits, terrainData);
  inputs.push(input);

  // Convert final state to model output (winning configuration)
  const winningUnits = winner === 'player' ? rotateUnits(playerUnits) : oppositionUnits;
  const output = unitsToModelOutput(winningUnits);
  outputs.push(output);

  return { inputs, outputs };
}
