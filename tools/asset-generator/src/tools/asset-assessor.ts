import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { Asset } from '../assets/assets-types.js';
import { generateContent } from './genaicode-executor.js';
import { ASSET_ASSESSOR_PROMPT } from './prompts.js';
import * as path from 'path';
import * as fs from 'fs/promises';

interface AssessmentContext {
  referenceImageDescription?: string;
  renderedAssetDescription?: string;
  implementationDescription?: string;
}

interface StepResult<T> {
  result: T;
  promptItems: PromptItem[];
}

/**
 * Execute a single step in the Chain of Thought process
 */
async function executeStep<T>(
  promptItems: PromptItem[],
  requiredFunctionName: string,
  stepName: string,
): Promise<StepResult<T>> {
  try {
    console.log(`Executing ${stepName}...`);
    const [result] = await generateContent(
      promptItems,
      [describeReferenceImageDef, describeAssetRenderingDef, describeCurrentImplementationDef, assessAssetDef],
      requiredFunctionName,
      0.7,
      ModelType.CHEAP,
    );

    // Add assistant's response as a prompt item
    const assistantPromptItem: PromptItem = {
      type: 'assistant',
      text: `${stepName} Result:`,
      functionCalls: [
        {
          name: requiredFunctionName,
          args: result.args,
        },
      ],
    };

    return {
      result: result.args as T,
      promptItems: [
        assistantPromptItem,
        {
          type: 'user',
          functionResponses: [
            {
              name: requiredFunctionName,
              content: '',
            },
          ],
        },
      ],
    };
  } catch (error) {
    console.error(`Error in ${stepName}:`, error);
    throw new Error(`Failed to execute ${stepName}: ${(error as Error).message}`);
  }
}

/**
 * Assess an asset by analyzing its rendering result
 * @param assetPath Path to the asset file
 * @param asset The asset to assess
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param dataUrl The data URL of the rendered asset
 * @returns Promise resolving to the assessment text
 */
export async function assessAsset(
  assetPath: string,
  asset: Asset,
  currentImplementation: string | null,
  dataUrl: string,
): Promise<string> {
  try {
    // Initialize assessment context and base prompt items
    const context: AssessmentContext = {};

    // Handle reference image if specified
    let referenceImageData: string | undefined;
    if (asset.referenceImage) {
      try {
        const imagePath = path.join(path.dirname(assetPath), asset.referenceImage);
        const imageBuffer = await fs.readFile(imagePath);
        referenceImageData = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        // Step 1: Describe reference image
        const refImageStep = await executeStep<{ description: string }>(
          [
            ASSET_ASSESSOR_PROMPT,
            {
              type: 'user',
              text: 'Reference image for analysis:',
              images: [
                {
                  mediaType: 'image/png',
                  base64url: referenceImageData.split('data:image/png;base64,')[1],
                },
              ],
            },
            {
              type: 'user',
              text: 'Please analyze the reference image in detail (200 words max):',
            },
          ],
          describeReferenceImageDef.name,
          'Reference Image Analysis',
        );

        context.referenceImageDescription = refImageStep.result.description;
      } catch (error) {
        console.warn(`Warning: Could not load reference image ${asset.referenceImage}:`, (error as Error).message);
      }
    }

    // Step 2: Describe rendered asset
    const renderStep = await executeStep<{ description: string }>(
      [
        ASSET_ASSESSOR_PROMPT,
        {
          type: 'user',
          text: 'Rendered asset for analysis:',
          images: [
            {
              mediaType: 'image/png',
              base64url: dataUrl.split('data:image/png;base64,')[1],
            },
          ],
        },
        {
          type: 'user',
          text: 'Please analyze the rendered asset in detail (200 words max):',
        },
      ],
      describeAssetRenderingDef.name,
      'Rendered Asset Analysis',
    );

    context.renderedAssetDescription = renderStep.result.description;

    // Step 3: Describe implementation (if available)
    if (currentImplementation) {
      const implStep = await executeStep<{ description: string }>(
        [
          ASSET_ASSESSOR_PROMPT,
          {
            type: 'user',
            text: 'Current implementation:\n\n' + `\`\`\`typescript\n${currentImplementation}\n\`\`\``,
          },
          {
            type: 'user',
            text: 'Please analyze the implementation in detail (200 words max):',
          },
        ],
        describeCurrentImplementationDef.name,
        'Implementation Analysis',
      );

      context.implementationDescription = implStep.result.description;
    }

    const assessStep = await executeStep<{ assessment: string }>(
      [
        ASSET_ASSESSOR_PROMPT,
        {
          type: 'user',
          text: `Please provide the final assessment based on all previous analyses (max 200 words).

## Asset Name:
${asset.name}

## Asset Description: 
${asset.description}

## Reference Image Analysis
${context.referenceImageDescription || 'No reference image provided.'}

## Rendered Asset Analysis
${context.renderedAssetDescription}

## Implementation Analysis
${context.implementationDescription || 'No current implementation available.'}`,
        },
      ],
      assessAssetDef.name,
      'Final Assessment',
    );

    return assessStep.result.assessment;
  } catch (error) {
    console.error('Error during asset assessment:', error);
    throw new Error(`Failed to assess asset: ${(error as Error).message}`);
  }
}

/**
 * Function definition for describing a reference image
 */
const describeReferenceImageDef: FunctionDef = {
  name: 'describeReferenceImage',
  description: 'Describe the reference image for an asset',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Detailed description of the reference image, max 200 words',
        maxLength: 1000,
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for describing an asset rendering
 */
const describeAssetRenderingDef: FunctionDef = {
  name: 'describeAssetRendering',
  description: 'Describe the rendered asset',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Detailed description of the rendered asset, max 200 words',
        maxLength: 1000,
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for describing current implementation
 */
const describeCurrentImplementationDef: FunctionDef = {
  name: 'describeCurrentImplementation',
  description: 'Describe the current implementation of the asset',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Detailed description of the current implementation, max 200 words',
        maxLength: 1000,
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for the final assessment
 */
const assessAssetDef: FunctionDef = {
  name: 'assessAsset',
  description: 'Assess an asset by analyzing its rendering result',
  parameters: {
    type: 'object',
    properties: {
      assessment: {
        type: 'string',
        description: 'The outcome of the assessment, max 200 words',
        maxLength: 1000,
      },
    },
    required: ['assessment'],
  },
};
