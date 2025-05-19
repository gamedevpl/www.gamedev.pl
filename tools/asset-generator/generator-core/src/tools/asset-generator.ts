import { FunctionDef, ModelType, PromptImageMediaType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset } from '../assets-types.js';
import { FileState, GoogleGenAI } from '@google/genai';
import { getServiceConfig } from 'genaicode/ai-service/service-configurations.js';

/**
 * Function definition for generating a complete asset implementation in one shot.
 */
const generateCompleteAssetDef: FunctionDef = {
  name: 'generateCompleteAsset',
  description: 'Generate a complete asset implementation in a single response.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The complete generated TypeScript code for the asset.',
      },
      summaryOfChanges: {
        type: 'string',
        description: 'A brief summary of the changes made or the asset generated.',
      },
    },
    required: ['content', 'summaryOfChanges'],
  },
};

/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param assetPath Path to the asset file (for loading reference image)
 * @param asset The Asset object (for accessing referenceImage field)
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param renderedMedia Array of rendered media items (images/videos) for each stance, or null
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @param fromScratch Whether to regenerate the asset from scratch, ignoring the current implementation
 * @param originalDescription Original description of the asset (used when fromScratch is true or no current impl.)
 * @param modelType The model type to use for generation (default: ModelType.DEFAULT)
 * @returns Promise resolving to the improved implementation code
 */
export async function generateImprovedAsset(
  assetName: string,
  assetPath: string,
  asset: Asset | null, // Can be null if asset doesn't exist yet
  currentImplementation: string | null,
  renderedMedia: { stance: string; mediaType: string; dataUrl: string; filePath: string }[] | null,
  additionalPrompt?: string,
  fromScratch?: boolean,
  originalDescription?: string,
  modelType: ModelType = ModelType.DEFAULT,
): Promise<string> {
  const effectiveImplementation = fromScratch ? null : currentImplementation;
  const promptItems: PromptItem[] = [ASSET_GENERATOR_PROMPT];

  const genAI = new GoogleGenAI({ apiKey: getServiceConfig('ai-studio').apiKey });

  let referenceImageDataBase64: string | undefined;
  if (asset?.referenceImage) {
    try {
      const imagePath = path.join(path.dirname(assetPath), asset.referenceImage);
      const imageBuffer = await fs.readFile(imagePath);
      referenceImageDataBase64 = imageBuffer.toString('base64');
      promptItems.push({
        type: 'user',
        text: 'Reference image for the asset. Please analyze this image for style, key elements, and features that should be reflected in the generated asset.',
        images: [
          {
            mediaType: 'image/png', // Assuming reference is always PNG for now
            base64url: referenceImageDataBase64,
          },
        ],
      });
      console.log('Reference image loaded and added to prompt.');
    } catch (error) {
      console.warn(`Warning: Could not load reference image ${asset.referenceImage}:`, (error as Error).message);
    }
  } else {
    console.log('No reference image provided for the asset.');
  }

  if (renderedMedia && renderedMedia.length > 0) {
    for (const media of renderedMedia) {
      if (media.mediaType.startsWith('image/')) {
        promptItems.push({
          type: 'user',
          text: `Rendered image for stance: "${
            media.stance
          }". Please analyze this visual output. Identify any discrepancies or areas for improvement based on the asset description and visual quality. ${
            asset?.referenceImage ? 'Ensure the style is consistent with the reference image.' : ''
          }`,
          images: [
            {
              mediaType: media.mediaType as PromptImageMediaType,
              base64url: media.dataUrl.split(';base64,')[1],
            },
          ],
        });
      } else if (media.mediaType.startsWith('video/')) {
        const file = await genAI.files.upload({
          file: media.filePath,
        });
        while ((await genAI.files.get({ name: file.name })).state !== FileState.ACTIVE) {
          console.log(`Waiting for video file ${file.name} to be processed...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        promptItems.push({
          type: 'user',
          text: `Rendered video for stance: "${
            media.stance
          }". Please analyze this animation. Consider smoothness, correctness of motion, and overall visual appeal according to the asset description and desired stance characteristics.${
            asset?.referenceImage ? ' Ensure the style is consistent with the reference image.' : ''
          }`,
          images: [
            {
              mediaType: media.mediaType as PromptImageMediaType,
              uri: file.uri,
              base64url: media.dataUrl.split(';base64,')[1],
            },
          ],
        });
      }
    }
    console.log(`Added ${renderedMedia.length} rendered media items to prompt.`);
  } else {
    console.log('No rendered media provided to generator (e.g., from scratch or render skipped).');
  }

  const generationMode = fromScratch ? 'a new implementation from scratch' : 'an improved implementation';
  let mainPromptText = `
    Please generate ${generationMode} of the "${assetName}" asset.
    Asset's target description is:

${originalDescription || 'No detailed description provided.'}

`;

  if (asset?.referenceImage && fromScratch) {
    // because the initial code is not available, we need to add the reference image to the prompt
    mainPromptText += `Path to the reference image: ${asset.referenceImage}
    `;
  }

  if (effectiveImplementation) {
    mainPromptText += `Current implementation to be improved:
<code>
${effectiveImplementation}
</code>
`;
  } else {
    mainPromptText += `No current implementation exists. Generate the code from scratch based on the description, ${
      asset?.referenceImage ? 'the reference image,' : ''
    } and desired visual characteristics.
`;
  }

  if (additionalPrompt) {
    mainPromptText += `Special Requirements from User:
${additionalPrompt}
`;
  }

  mainPromptText += `\
    Based on your analysis of the asset description, ${
      asset?.referenceImage ? 'the reference image, ' : ''
    }and the rendered media for each stance (if provided), please generate the complete TypeScript code for the asset.

    Key Instructions:
    1. Analyze all provided visual materials (${
      asset?.referenceImage ? 'reference image, ' : ''
    }rendered stance images/videos) and the asset description.
    2. Identify areas where the current implementation (if any) succeeds or fails to meet the visual and functional requirements.
    3. If improving existing code, make targeted, minimal changes to address identified issues. Preserve working parts.
    4. If generating from scratch, create a robust implementation based on the description and any visual references.
    5. Ensure the output strictly adheres to the Asset interface and all coding/formatting requirements detailed in the system prompt (e.g., imports, export const AssetName: Asset = { ... }, no canvas clearing).
    6. The code must be complete, valid, and error-free TypeScript.

    Provide the full, updated asset code.`;

  promptItems.push({
    type: 'user',
    text: mainPromptText,
    cache: true,
  });

  const result = await generateCode(
    promptItems,
    {
      functionDefs: [generateCompleteAssetDef],
      requiredFunctionName: generateCompleteAssetDef.name,
      temperature: 0.7,
      modelType,
      expectedResponseType: { functionCall: true, text: false, media: false },
    },
    {},
  );

  const functionCall = result.find((item) => item.type === 'functionCall')?.functionCall;

  if (!functionCall || !functionCall.args) {
    throw new Error('Failed to generate asset implementation: No function call or arguments in response.');
  }

  const { content, summaryOfChanges } = functionCall.args as { content: string; summaryOfChanges?: string };

  if (summaryOfChanges) {
    console.log('Asset generation summary:', summaryOfChanges);
  }

  if (!content) {
    throw new Error('Failed to generate asset implementation: No content in response.');
  }

  console.log('Complete asset implementation generated successfully based on visual analysis.');
  return content;
}
