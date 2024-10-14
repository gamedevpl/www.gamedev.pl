import * as fs from 'fs';
import * as tf from '@tensorflow/tfjs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import '@tensorflow/tfjs-node';
import { INPUT_COLS, INPUT_ROWS, INPUT_SHAPE, ModelInput, ModelOutput, OUTPUT_SHAPE } from './types';

let model: tf.LayersModel;

function createModel() {
  const newModel = tf.sequential();

  newModel.add(
    tf.layers.lstm({
      units: INPUT_COLS,
      returnSequences: true,
      inputShape: [INPUT_ROWS, INPUT_COLS * INPUT_SHAPE],
      activation: 'relu',
    }),
  );

  newModel.add(
    tf.layers.timeDistributed({
      layer: tf.layers.dense({ units: INPUT_COLS * OUTPUT_SHAPE, activation: 'linear' }),
    }),
  );

  model = newModel;
}

function compileModel() {
  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MODEL_DIR_PATH = path.join(__dirname, '..', '..', '..', 'public', 'tfmodel');

export async function saveModel() {
  await model.save('file://' + MODEL_DIR_PATH);
}

export async function loadModel(newModel = false) {
  if (!newModel && fs.existsSync(MODEL_DIR_PATH + '/model.json') && fs.existsSync(MODEL_DIR_PATH + '/weights.bin')) {
    console.log('Loading model from disk');
    model = await tf.loadLayersModel('file://' + MODEL_DIR_PATH + '/model.json');
  } else {
    console.log('Creating new model');
    createModel();
  }

  compileModel();
}

export async function train(inputs: ModelInput[], outputs: ModelOutput[], epochs = 50) {
  const xs = tf.tensor3d(flattenData(inputs));
  const ys = tf.tensor3d(flattenData(outputs));

  await model.fit(xs, ys, { epochs, validationSplit: 0.1 });
}

export function predict(input: number[][]): number[][] {
  const xs = tf.tensor([input]);
  const prediction = model.predict(xs) as tf.Tensor;
  const output = prediction.squeeze([0]); // Remove batch dimension
  return output.arraySync() as number[][];
}

function flattenData(inputs: (ModelInput | ModelOutput)[]): number[][][] {
  return inputs.map((input) => input.data.map((row) => row.flat()));
}
