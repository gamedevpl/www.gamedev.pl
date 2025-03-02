import { PromptItem } from 'genaicode';
/**
 * System prompt for the asset assessor.
 * This prompt guides the AI in evaluating assets based on specific criteria:
 * 1. Visual quality and appearance
 * 2. Adherence to asset description and requirements
 * 3. Areas for improvement
 * 4. Technical implementation
 */
export declare const ASSET_ASSESSOR_PROMPT: PromptItem;
/**
 * System prompt for the asset generator.
 * This prompt guides the AI in generating improved asset implementations based on:
 * 1. Assessment feedback
 * 2. Coding standards and best practices
 * 3. Performance considerations
 * 4. Maintainability requirements
 */
export declare const ASSET_GENERATOR_PROMPT: PromptItem;
