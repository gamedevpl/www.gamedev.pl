import { LintResult, formatLintErrors } from './asset-linter.js';
import { FunctionDef } from 'genaicode';
import { generateImprovedAsset } from './asset-generator.js';

/**
 * Interface for the result of fixing linting errors
 */
export interface LintFixResult {
  /** Whether the fixing was successful */
  success: boolean;
  /** Fixed code if successful, original code if not */
  code: string;
  /** Error message if fixing failed */
  error?: string;
}

/**
 * Fix linting errors using GenAIcode
 * @param lintResult Results from linting an asset file
 * @returns Promise resolving to the fixed code and summary
 * @throws Error if fixing fails
 */
export async function fixLintErrors(lintResult: LintResult): Promise<LintFixResult> {
  try {
    if (!lintResult.hasErrors && !lintResult.hasWarnings) {
      return {
        success: true,
        code: lintResult.source,
      };
    }

    let currentCode = lintResult.source;

    // Format the linting errors for the prompt
    const formattedErrors = formatLintErrors(lintResult);
    console.log(`Found ${lintResult.errors.length} linting issues.`);

    // Generate a patch to fix the linting errors
    const fixedContent = await generateFixedContent(lintResult.assetName, currentCode, formattedErrors);

    if (!fixedContent.success || !fixedContent.newContent) {
      return {
        success: false,
        code: currentCode,
        error: 'Failed to generate a valid patch',
      };
    }

    currentCode = fixedContent.newContent;

    return {
      success: true,
      code: currentCode,
    };
  } catch (error) {
    console.error('Error fixing linting errors:', error);
    return {
      success: false,
      code: lintResult.source, // Return original code on error
      error: (error as Error).message,
    };
  }
}

async function generateFixedContent(assetName: string, sourceCode: string, formattedErrors: string) {
  // Create the prompt for GenAIcode
  const promptMessage = `
Here are the linting errors that need to be fixed:

${formattedErrors}
`;

  try {
    const newContent = await generateImprovedAsset(assetName, sourceCode, promptMessage);
    return {
      newContent,
      success: true,
    };
  } catch (error) {
    return {
      newContent: null,
      success: false,
    };
  }
}

/**
 * Function definition for generating a lint patch
 */
const generateLintPatchDef: FunctionDef = {
  name: 'generateLintPatch',
  description: 'Generate a patch to fix ESLint errors in TypeScript code',
  parameters: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'The patch in unified diff format to fix linting errors',
      },
      summary: {
        type: 'string',
        description: 'Summary of changes made in the patch',
      },
    },
    required: ['patch', 'summary'],
  },
};
