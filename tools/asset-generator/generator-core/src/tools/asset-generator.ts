import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';

/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param assessment Assessment of the current implementation
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @param fromScratch Whether to regenerate the asset from scratch, ignoring the current implementation
 * @returns Promise resolving to the improved implementation code
 */
export async function generateImprovedAsset(
  assetName: string,
  currentImplementation: string | null,
  assessment: string,
  additionalPrompt?: string,
  fromScratch?: boolean,
): Promise<string> {
  // If fromScratch is true, ignore the current implementation
  const effectiveImplementation = fromScratch ? null : currentImplementation;

  const basePromptMessage = `
    Generate ${fromScratch ? 'a new implementation from scratch' : 'an improved implementation'} of the ${assetName} asset.
    ${
      effectiveImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }
    
    Assessment of current version:
    ${assessment}

    ${additionalPrompt ? `Special Requirements from User:\n    ${additionalPrompt}\n` : ''}
    ${fromScratch ? 'IMPORTANT: Create a completely new implementation from scratch, ignoring any existing code structure.\n' : ''}

    Requirements:
    1. Implement the Asset interface with name and render method
    2. Use TypeScript and Canvas API
    3. Focus on visual quality and performance
    4. Include proper type annotations
    5. Follow best practices for code organization
    6. IMPORTANT: Adhere to suggested improvements from the assessment
    7. Make sure the code is valid and error-free
    8. Find balance between code readability and verbosity
    9. IMPORTANT: Make only the minimal necessary changes to address the issues highlighted in the assessment
    10. Preserve all parts of the code that are already working well
    11. In the render method, do not clean the canvas, assume it is already cleared and ready for rendering
    12. Your modifications should directly correspond to the issues identified in the assessment
    13. DO NOT refactor or rewrite the entire codebase unless the assessment explicitly requires it
    14. Focus on incremental, targeted improvements rather than complete overhauls

    Provide only the necessary changes to address the issues in the assessment while maintaining the overall structure and approach of the existing code. If the current implementation is good in some areas, keep those parts unchanged.

    Recommended strategy for chunk generation:
    1. First chunk: the file header
    2. Subsequent chunks: top level declarations, helper functions, types, consts etc.
    3. Last chunk: declaration of the Asset class and render method, and export

    Do not generate more than 400 lines of code per chunk. If the implementation would exceed this limit, split it into multiple chunks.
    Split chunk only at logical points, such as after a function declaration or at the end of a block.
    Do not split chunks in a middle of a function or a block or a line.

    Now please start from generating the first chunk of the improved implementation.
  `;

  const prompt: PromptItem[] = [
    ASSET_GENERATOR_PROMPT,
    {
      type: 'user',
      text: basePromptMessage,
      cache: true,
    },
  ];

  // Initialize variables for chunk generation
  let accumulatedImplementation = '';
  let currentChunk = '';
  let isComplete = false;
  let chunkIndex = 0;

  // DO...UNTIL loop to generate chunks until complete
  do {
    // Generate the next chunk
    const result = await generateAssetChunk(prompt, chunkIndex);

    currentChunk = result.content;
    isComplete = result.isComplete;

    // Accumulate the implementation
    accumulatedImplementation = (accumulatedImplementation ? accumulatedImplementation + '\n' : '') + currentChunk;
    chunkIndex++;

    console.log(`Generated chunk ${chunkIndex}, isComplete: ${isComplete}`);

    prompt.push(
      {
        type: 'assistant',
        text: `Saving chunk ${chunkIndex} of the asset implementation.`,
        functionCalls: [
          {
            name: 'saveAssetChunk',
            args: {
              content: currentChunk,
              isComplete,
            },
          },
        ],
      },
      {
        type: 'user',
        text: `Chunk ${chunkIndex} saved successfully. Please generate the next chunk.`,
        cache: true,
        functionResponses: [
          {
            name: 'saveAssetChunk',
            content: '',
          },
        ],
      },
    );
  } while (!isComplete);

  console.log('Improved implementation complete after', chunkIndex, 'chunks');

  return accumulatedImplementation;
}

async function generateAssetChunk(
  prompt: PromptItem[],
  chunkIndex: number,
): Promise<{ content: string; isComplete: boolean }> {
  const chunkResult = await generateCode(prompt, [saveAssetChunkDef], 'saveAssetChunk', 0.7, ModelType.DEFAULT);

  if (!chunkResult || chunkResult.length === 0 || !chunkResult[0]?.args) {
    throw new Error('Failed to generate asset chunk');
  }

  const result = chunkResult[0].args as { content: string; isComplete: boolean; summaryOfChanges?: string };

  if (result.summaryOfChanges) {
    console.log(`Chunk ${chunkIndex} summary:`, result.summaryOfChanges);
  }

  return {
    content: result.content,
    isComplete: result.isComplete,
  };
}

/**
 * Function definition for saving a chunk of an asset implementation
 */
const saveAssetChunkDef: FunctionDef = {
  name: 'saveAssetChunk',
  description: 'Save a chunk of an asset implementation',
  parameters: {
    type: 'object',
    properties: {
      previousChunkAnalysis: {
        type: 'string',
        description: 'Analysis of the previous chunk of the asset implementation. Max 100 words.',
      },
      summaryOfChanges: {
        type: 'string',
        description: 'Summary of changes made in this chunk, max 100 words.',
      },
      content: {
        type: 'string',
        description: 'The content of this chunk of the asset implementation. Maximum of 4000 characters.',
        maxLength: 4000,
      },
      isComplete: {
        type: 'boolean',
        description: 'Whether this is the final chunk of the implementation',
      },
    },
    required: ['previousChunkAnalysis', 'summaryOfChanges', 'content', 'isComplete'],
  },
};
