import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

// Load the Universal Sentence Encoder model
const modelLoading = use.load();

export async function findMostSimilarSentence(input: string, sentences: string[]) {
  const model = await modelLoading;
  const inputEmbedding = (await model.embed([input])).arraySync();

  let closestSentence = '';
  let closestScore = 0.7; // this is the threshold, may be wrong

  for (const sentence of sentences) {
    const sentenceEmbedding = (await model.embed([sentence])).arraySync();

    const dotProduct = tf.matMul(inputEmbedding, tf.transpose(sentenceEmbedding));
    const norm1 = tf.norm(inputEmbedding);
    const norm2 = tf.norm(sentenceEmbedding);

    const score = dotProduct.div(tf.mul(norm1, norm2)).dataSync()[0];

    if (score > closestScore) {
      closestScore = score;
      closestSentence = sentence;
    }
  }

  return closestSentence;
}
