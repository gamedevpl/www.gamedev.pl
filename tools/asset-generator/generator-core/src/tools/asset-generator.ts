import { FunctionDef, ModelType, PromptImageMediaType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset } from '../assets-types.js';

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
  renderedMedia: { stance: string; mediaType: string; dataUrl: string }[] | null,
  additionalPrompt?: string,
  fromScratch?: boolean,
  originalDescription?: string,
  modelType: ModelType = ModelType.DEFAULT,
): Promise<string> {
  const effectiveImplementation = fromScratch ? null : currentImplementation;
  const promptItems: PromptItem[] = [ASSET_GENERATOR_PROMPT];

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
  }

  if (renderedMedia && renderedMedia.length > 0) {
    renderedMedia.forEach(media => {
      if (media.mediaType.startsWith('image/')) {
        promptItems.push({
          type: 'user',
          text: `Rendered image for stance: \"${media.stance}\". Please analyze this visual output. If a reference image is provided, compare this rendering to it. Identify any discrepancies or areas for improvement based on the asset description and visual quality.`,
          images: [
            {
              mediaType: media.mediaType as PromptImageMediaType,
              base64url: media.dataUrl.split(";base64,")[1],
            },
          ],
        });
      } else if (media.mediaType.startsWith('video/')) {
        // Note: Standard PromptItem doesn't explicitly support video URLs directly in 'images'.
        // This assumes the model can process base64 video data if provided this way or 
        // that 'genaicode' library handles it. For now, we'll add it similarly to images.
        // This might need adjustment based on actual LLM capabilities for video data in prompts.
        promptItems.push({
          type: 'user',
          text: `Rendered video for stance: \"${media.stance}\". Please analyze this animation. Consider smoothness, correctness of motion, and overall visual appeal according to the asset description and desired stance characteristics. If a reference image is provided, ensure the style is consistent. `,
          // Videos might need a different handling or a specific field if supported by the model/library
          // For now, adding as if it's an image, which might not be optimal or work for all models.
          images: [
            {
              mediaType: media.mediaType as PromptImageMediaType, // Casting, but 'video/*' might not be valid for 'PromptImageMediaType'
              base64url: media.dataUrl.split(";base64,")[1],
            },
          ],
        });
      }
    });
    console.log(`Added ${renderedMedia.length} rendered media items to prompt.`);
  } else {
    console.log('No rendered media provided to generator (e.g., from scratch or render skipped).');
  }

  const generationMode = fromScratch ? 'a new implementation from scratch' : 'an improved implementation';
  let mainPromptText = `\
    Please generate ${generationMode} of the \"${assetName}\" asset.\n    Asset's target description is:\n    ${originalDescription || asset?.description || 'No detailed description provided.'}\
\
`;

  if (effectiveImplementation) {
    mainPromptText += `Current implementation to be improved:\\n\\n\\n${effectiveImplementation}\\n\\n\\n`;
  } else {
    mainPromptText += 'No current implementation exists. Generate the code from scratch based on the description, reference image (if any), and desired visual characteristics.\n';
  }

  if (additionalPrompt) {
    mainPromptText += `Special Requirements from User:\\n${additionalPrompt}\n`;
  }

  mainPromptText += `\
    Based on your analysis of the asset description, the reference image (if provided), and the rendered media for each stance (if provided), please generate the complete TypeScript code for the asset.\n\
    Key Instructions:\n    1. Analyze all provided visual materials (reference image, rendered stance images/videos) and the asset description.\n    2. Identify areas where the current implementation (if any) succeeds or fails to meet the visual and functional requirements.\n    3. If improving existing code, make targeted, minimal changes to address identified issues. Preserve working parts.\n    4. If generating from scratch, create a robust implementation based on the description and any visual references.\n    5. Ensure the output strictly adheres to the Asset interface and all coding/formatting requirements detailed in the system prompt (e.g., imports, export const AssetName: Asset = { ... }, no canvas clearing).\n    6. The code must be complete, valid, and error-free TypeScript.\n\
    Provide the full, updated asset code.`;

  promptItems.push({
    type: 'user',
    text: mainPromptText,
    cache: true, // Cache if the core request (description, code) is the same
  });

  const result = await generateCode(
    promptItems,
    {
      functionDefs: [generateCompleteAssetDef],
      requiredFunctionName: generateCompleteAssetDef.name,
      temperature: 0.7, // Adjusted temperature for potentially more creative visual interpretation
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
