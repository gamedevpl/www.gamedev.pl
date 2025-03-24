import * as path from 'path';
import * as fs from 'fs/promises';
import { FunctionDef, ModelType, PromptImageMediaType, PromptItem } from 'genaicode';
import { Asset } from '../assets-types.js';
import { generateContent } from './genaicode-executor.js';
import { ASSET_ASSESSOR_PROMPT } from './prompts.js';

interface AssessmentContext {
  referenceImageDescription?: string;
  stanceDescriptions: Record<string, string>;
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
 */
export async function assessAsset(
  assetPath: string,
  asset: Asset,
  currentImplementation: string | null,
  stanceMedia: {
    stance: string;
    mediaType: string;
    dataUrl: string;
  }[],
): Promise<string> {
  try {
    // Initialize assessment context and base prompt items
    const context: AssessmentContext = {
      stanceDescriptions: {},
    };

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
              text: 'Please analyze the reference image in detail',
            },
          ],
          describeReferenceImageDef.name,
          'Reference Image Analysis',
        );

        context.referenceImageDescription = refImageStep.result.description;

        console.log('Reference image analysis completed:', refImageStep.result.description);
      } catch (error) {
        console.warn(`Warning: Could not load reference image ${asset.referenceImage}:`, (error as Error).message);
      }
    }

    // Step 2: Describe rendered asset for each stance separately
    // Group stanceMedia by stance
    const stanceGroups: Record<string, typeof stanceMedia> = {};
    stanceMedia.forEach((media) => {
      if (!stanceGroups[media.stance]) {
        stanceGroups[media.stance] = [];
      }
      stanceGroups[media.stance]!.push(media);
    });

    // Process each stance individually
    await Promise.all(
      Object.entries(stanceGroups).map(async ([stance, mediaItems]) => {
        console.log(`Analyzing stance: ${stance}`);

        const renderStep = await executeStep<{ description: string }>(
          [
            ASSET_ASSESSOR_PROMPT,
            ...mediaItems.map<PromptItem>(({ mediaType, dataUrl }) => ({
              type: 'user',
              text: `Rendered asset:`,
              images: [
                {
                  mediaType: mediaType as PromptImageMediaType,
                  base64url: dataUrl.split(`data:${mediaType};base64,`)[1],
                },
              ],
            })),
            {
              type: 'user',
              text: `Please analyze the rendering of the asset in detail.`,
            },
            {
              type: 'user',
              text: 'IMPORTANT: Output maximum 200 words, not more!',
            },
          ],
          describeAssetRenderingDef.name,
          `Rendered Asset Analysis`,
        );

        context.stanceDescriptions[stance] = renderStep.result.description;

        console.log(`Analysis for stance "${stance}" completed:`, renderStep.result.description);
      }),
    );

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
            text: 'Please analyze the implementation in detail, with particular attention to how different stances are handled',
          },
        ],
        describeCurrentImplementationDef.name,
        'Implementation Analysis',
      );

      context.implementationDescription = implStep.result.description;

      console.log('Implementation analysis completed:', implStep.result.description);
    }

    // Prepare stance descriptions for the final assessment
    let stanceDescriptionsText = '';
    for (const [stance, description] of Object.entries(context.stanceDescriptions)) {
      stanceDescriptionsText += `### Stance: ${stance}\n\n${description}\n\n`;
    }

    // Prepare the final assessment prompt with enhanced structure
    const finalAssessmentPrompt = `
Please provide the final assessment based on all previous analyses.

# Asset Information
- **Name**: ${asset.name}
- **Description**: ${asset.description}

# Reference Image Analysis
${context.referenceImageDescription || 'No reference image provided.'}

# Stance-Specific Analysis
${stanceDescriptionsText}

# Implementation Analysis
${context.implementationDescription || 'No current implementation available.'}

# Final Assessment Requirements
1. Provide a comprehensive assessment that addresses ALL stances individually
2. For each stance, identify specific issues and provide clear, actionable recommendations
3. Prioritize the most critical issues that need to be addressed
4. Include both visual and technical aspects in your assessment
5. Consider how stances work together as a cohesive asset
6. IMPORTANT: Structure your assessment with clear headers for each stance
7. Make sure each stance-specific issue has a corresponding recommendation
`;

    // Step 4: Generate the final assessment
    const assessStep = await executeStep<{ assessment: string }>(
      [
        ASSET_ASSESSOR_PROMPT,
        {
          type: 'user',
          text: finalAssessmentPrompt,
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
        description: 'Detailed description of the reference image',
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
        description: 'Detailed analysis of the rendered asset (max 1000 words)',
        maxLength: 5000,
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
        description: 'Detailed description of the current implementation',
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
        description: `Output the analysis in a structured format, including visual and technical aspects.
Use not more than 200 words.

Desired format of the assessment:
\`\`\`
<Identification of the stance>
<Evaluation of the rendering quality>
<Evaluation of the accuracy of the rendering>
<Evaluation of the style of the rendering>
<Evaluation of the overall impression of the rendering>
<Summary of the rendering analysis>
\`\`\``,
        maxLength: 1000,
      },
    },
    required: ['assessment'],
  },
};
