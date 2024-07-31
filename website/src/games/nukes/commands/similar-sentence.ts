import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

// Load the Universal Sentence Encoder model
const modelLoading = use.load();

const sentenceEmbeddings: Record<string, ReturnType<typeof getSentenceEmbedding>> = {};

export async function findMostSimilarSentence(input: string, sentences: string[]) {
  const model = await modelLoading;
  const inputEmbedding = (await model.embed([input])).arraySync();

  let closestSentence = '';
  let closestScore = 0.7; // this is the threshold, may be wrong

  for (const sentence of sentences) {
    const { norm2, sentenceEmbeddingTrans } = await (sentenceEmbeddings[sentence] ??
      (sentenceEmbeddings[sentence] = getSentenceEmbedding(sentence)));

    const dotProduct = tf.matMul(inputEmbedding, sentenceEmbeddingTrans);
    const norm1 = tf.norm(inputEmbedding);

    const score = dotProduct.div(tf.mul(norm1, norm2)).dataSync()[0];

    if (score > closestScore) {
      closestScore = score;
      closestSentence = sentence;
    }
  }

  return closestSentence;
}

async function getSentenceEmbedding(sentence: string) {
  const model = await modelLoading;
  const sentenceEmbedding = (await model.embed([sentence])).arraySync();

  return {
    norm2: tf.norm(sentenceEmbedding),
    sentenceEmbeddingTrans: tf.transpose(sentenceEmbedding),
  };
}
