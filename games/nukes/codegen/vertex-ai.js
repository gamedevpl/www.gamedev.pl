import assert from 'node:assert';
import { VertexAI } from '@google-cloud/vertexai';
import { explanationFD, updateFileFD } from './function-calling.js';

// A function to generate content using the generative model
export async function generateContent(systemPrompt, prompt) {
  const req = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    tools: [
      {
        functionDeclarations: [updateFileFD, explanationFD],
      },
    ],
    // TODO: add tool_config once [it is supported](https://github.com/googleapis/nodejs-vertexai/issues/331)
  };

  const result = await getGenModel(systemPrompt).generateContent(req);

  if (result.response.promptFeedback) {
    console.log(JSON.stringify(result.response.promptFeedback, null, 2));
  }

  if (!result.response.candidates?.length > 0) {
    console.log('Response:', result);
    throw new Error('No candidates found');
  }

  const functionCalls = result.response.candidates
    .map((candidate) => candidate.content.parts?.map((part) => part.functionCall))
    .flat()
    .filter((functionCall) => !!functionCall);

  assert(
    functionCalls.every((call) => call.name === 'updateFile' || call.name === 'explanation'),
    'Only updateFile and explanation functions are allowed',
  );

  if (functionCalls.length === 0) {
    const textResponse = result.response.candidates
      .map((candidate) => candidate.content.parts?.map((part) => part.text))
      .flat()
      .filter((text) => !!text)
      .join('\n');
    console.log('No function calls, output text response if it exists:', textResponse);
  }

  console.log(
    'Explanations:',
    functionCalls.filter((fn) => fn.name === 'explanation').map((call) => call.args.text),
  );

  return functionCalls.filter((fn) => fn.name === 'updateFile').map((call) => call.args);
}

// A function to get the generative model
export function getGenModel(systemPrompt) {
  // Initialize Vertex with your Cloud project and location
  const vertex_ai = new VertexAI({ project: 'gamedevpl', location: 'us-central1' });
  const model = 'gemini-1.5-pro-001';

  // Instantiate the models
  return vertex_ai.preview.getGenerativeModel({
    model: model,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0,
      topP: 0.95,
    },
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
    systemInstruction: {
      role: 'system',
      parts: [
        {
          text: systemPrompt,
        },
      ],
    },
  });
}
