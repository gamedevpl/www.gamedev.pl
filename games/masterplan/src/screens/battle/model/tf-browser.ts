import * as tf from '@tensorflow/tfjs';
import { ModelInput, ModelOutput, INPUT_ROWS, INPUT_COLS, ModelOutputCell, OUTPUT_SHAPE } from './types';

let model: tf.LayersModel | null = null;

async function loadModel(): Promise<void> {
  try {
    if (!model) {
      model = await tf.loadLayersModel(window.location.origin + window.location.pathname + '/tfmodel/model.json');
      console.log('Model loaded successfully');
    } else {
      console.log('Model is already loaded');
    }
  } catch (error) {
    console.error('Failed to load the model:', error);
    throw error;
  }
}

function flattenInput(input: ModelInput): number[][][] {
  return [input.data.map((row) => row.flat())];
}

export async function predict(input: ModelInput): Promise<ModelOutput> {
  if (!model) {
    await loadModel();
  }

  if (!model) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  const xs = tf.tensor3d(flattenInput(input));
  const prediction = model.predict(xs) as tf.Tensor;
  const output = prediction.squeeze([0]); // Remove batch dimension
  const result = output.arraySync() as number[][];

  // Clean up tensors to prevent memory leaks
  xs.dispose();
  prediction.dispose();
  output.dispose();

  return {
    data: result.map((row) =>
      row.reduce((acc, _, index) => {
        if (index % OUTPUT_SHAPE === 0) {
          acc.push(row.slice(index, index + OUTPUT_SHAPE) as ModelOutputCell);
        }
        return acc;
      }, [] as ModelOutputCell[]),
    ),
    cols: INPUT_COLS,
    rows: INPUT_ROWS,
  };
}
