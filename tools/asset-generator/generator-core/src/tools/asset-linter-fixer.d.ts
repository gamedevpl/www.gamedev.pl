import { LintResult } from './asset-linter.js';
import { Asset } from '../assets-types.js';
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
 * @param asset The Asset object (can be null if not available)
 * @param assetPath Path to the asset file
 * @returns Promise resolving to the fixed code and summary
 * @throws Error if fixing fails
 */
export declare function fixLintErrors(lintResult: LintResult, asset: Asset | null, assetPath: string): Promise<LintFixResult>;
