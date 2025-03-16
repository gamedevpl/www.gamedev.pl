import { ESLint } from 'eslint';
import * as path from 'path';
import * as fs from 'fs/promises';

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
  /** Asset name */
  assetName: string;
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
 * @param assetName
 * @param filePath Path to the asset file to lint
 * @returns Promise resolving to the linting results
 * @throws Error if linting fails
 */
export async function lintAssetFile(assetName: string, filePath: string): Promise<LintResult> {
  try {
    // Read the file content
    const source = await fs.readFile(filePath, 'utf-8');

    // Determine the config file location (use the one in generator-assets)
    const eslintConfigPath = path.resolve(process.cwd(), '..', 'generator-assets', '.eslintrc.cjs');

    // Initialize ESLint with the config
    const eslint = new ESLint({
      overrideConfigFile: eslintConfigPath,
      useEslintrc: false,
      extensions: ['.ts'],
      fix: false,
    });

    // Run ESLint on the file
    const results = await eslint.lintText(source, { filePath });

    if (results.length === 0) {
      // No results means no errors
      return {
        assetName,
        filePath,
        hasErrors: false,
        hasWarnings: false,
        errors: [],
        source,
      };
    }

    // Convert ESLint results to our LintError format
    const errors: LintError[] = results[0].messages.map((message) => ({
      ruleId: message.ruleId,
      severity: message.severity,
      fixable: message.fix !== undefined,
      message: message.message,
      line: message.line,
      column: message.column,
      endLine: message.endLine,
      endColumn: message.endColumn,
    }));

    // Check if there are any errors or warnings
    const hasErrors = errors.some((error) => error.severity === 2);
    const hasWarnings = errors.some((error) => error.severity === 1);

    return {
      assetName,
      filePath,
      hasErrors,
      hasWarnings,
      errors,
      source,
    };
  } catch (error) {
    console.error('Error linting asset file:', error);
    throw new Error(`Failed to lint asset file: ${(error as Error).message}`);
  }
}

/**
 * Format linting errors for display
 * @param lintResult Linting results
 * @returns Formatted string of linting errors
 */
export function formatLintErrors(lintResult: LintResult): string {
  if (!lintResult.hasErrors && !lintResult.hasWarnings) {
    return 'No linting issues found.';
  }

  const formatted = [`Linting issues in ${path.basename(lintResult.filePath)}:`];

  lintResult.errors.forEach((error) => {
    const severity = error.severity === 2 ? 'Error' : 'Warning';
    const ruleId = error.ruleId ? `(${error.ruleId})` : '';
    formatted.push(`  ${severity} ${ruleId}: ${error.message} at line ${error.line}, column ${error.column}`);
  });

  return formatted.join('\n');
}

/**
 * Check if linting errors are fixable
 * @param lintResult Linting results
 * @returns True if there are fixable errors, false otherwise
 */
export function hasFixableErrors(lintResult: LintResult): boolean {
  return lintResult.errors.some((error) => error.fixable);
}
