/**
 * Interface for a linting error
 */
export interface LintError {
    /** Rule ID that was violated */
    ruleId: string | null;
    /** Severity of the error (0 = off, 1 = warning, 2 = error) */
    severity: number;
    /** Whether the error can be fixed automatically */
    fixable: boolean;
    /** Error message */
    message: string;
    /** Line number where the error occurred */
    line: number;
    /** Column number where the error occurred */
    column: number;
    /** End line number where the error occurred */
    endLine?: number;
    /** End column number where the error occurred */
    endColumn?: number;
}
/**
 * Interface for linting results
 */
export interface LintResult {
    /** Path to the file that was linted */
    filePath: string;
    /** Whether any errors were found */
    hasErrors: boolean;
    /** Whether any warnings were found */
    hasWarnings: boolean;
    /** Array of linting errors */
    errors: LintError[];
    /** Original source code */
    source: string;
}
/**
 * Lint an asset file using ESLint
 * @param filePath Path to the asset file to lint
 * @returns Promise resolving to the linting results
 * @throws Error if linting fails
 */
export declare function lintAssetFile(filePath: string): Promise<LintResult>;
/**
 * Format linting errors for display
 * @param lintResult Linting results
 * @returns Formatted string of linting errors
 */
export declare function formatLintErrors(lintResult: LintResult): string;
/**
 * Check if linting errors are fixable
 * @param lintResult Linting results
 * @returns True if there are fixable errors, false otherwise
 */
export declare function hasFixableErrors(lintResult: LintResult): boolean;
