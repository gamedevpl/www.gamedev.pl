import { VertexAI } from '@google-cloud/vertexai';
import { systemPrompt, codeGenPrompt } from './prompt-gen.js';
import { parsePromptResponse } from './prompt-parse.js';
import { updateFiles } from './update-files.js';

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({ project: 'gamedevpl', location: 'us-central1' });
const model = 'gemini-1.5-pro-001';

// Instantiate the models
const generativeModel = vertex_ai.preview.getGenerativeModel({
  model: model,
  generationConfig: {
    maxOutputTokens: 8192,
    temperature: 1,
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

const text1 = {
  text: codeGenPrompt,
};

async function generateContent() {
  const req = {
    contents: [{ role: 'user', parts: [text1] }],
  };

  const result = await generativeModel.generateContent(req);

  return result.response.candidates[0].content.parts[0].text;
}

console.log('Generating response');
const promptResponseText = await generateContent();
console.log('Parse response');
const parsedResponse = parsePromptResponse(promptResponseText);

console.log('Update files');
updateFiles(parsedResponse);
console.log('Done!');
