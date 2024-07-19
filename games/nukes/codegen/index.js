import { getSystemPrompt } from './systemprompt.js';
import { getCodeGenPrompt } from './prompt-codegen.js';
import { updateFiles } from './update-files.js';
import { generateContent } from './vertex-ai.js';
import { dryRun, chatGpt, anthropic } from './cli-params.js';
import { validateCliParams } from './validate-cli-params.js';
import { generateContent as generateContentGPT } from './chat-gpt.js';
import { generateContent as generateContentClaude } from './anthropic.js';

// Print to console the received parameters
console.log(`Received parameters: ${process.argv.slice(2).join(' ')}`);

validateCliParams();

console.log('Generating response');
const functionCalls = await (anthropic ? generateContentClaude : chatGpt ? generateContentGPT : generateContent)(getSystemPrompt(), getCodeGenPrompt());
console.log('Received function calls:', functionCalls);

if (dryRun) {
  console.log('Dry run mode, not updating files');
} else {
  console.log('Update files');
  updateFiles(functionCalls);
  console.log('Done!');
}
