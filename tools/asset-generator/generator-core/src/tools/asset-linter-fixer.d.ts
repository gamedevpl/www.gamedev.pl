import { LintResult } from './asset-linter.js';
/**
 * Interface for the result of fixing linting errors
 */
export interface LintFixResult {
    /** Whether the fixing was successful */
    success: boolean;
    /** Fixed code if successful, original code if not */
    code: string;
    /** Summary of changes made */
    summary: string;
    /** Error message if fixing failed */
    error?: string;
}
/**
 * Fix linting errors using GenAIcode
 * @param lintResult Results from linting an asset file
 * @returns Promise resolving to the fixed code and summary
 * @throws Error if fixing fails
 */
export declare function fixLintErrors(lintResult: LintResult): Promise<LintFixResult>;
