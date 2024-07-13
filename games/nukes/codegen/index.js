import { systemPrompt, codeGenPrompt } from './prompt-gen.js';
import { updateFiles } from './update-files.js';
import { generateContent } from './vertex-ai.js';

// Validate CLI parameters accordingly to those mentioned in README.md, fail the process if not valid, or unknown parameter is passed
const allowedParameters = [
  '--dry-run',
  '--consider-all-files',
  '--allow-file-create',
  '--allow-file-delete',
];

const providedParameters = process.argv.slice(2);

providedParameters.forEach((param) => {
  if (!param.startsWith('--')) {
    console.error(`Invalid parameter: ${param}, all parameters must start with --`);
    process.exit(1);
  }
  const parameterName = param.substring(2);
  if (!allowedParameters.includes(parameterName)) {
    console.error(`Invalid parameter: ${param}, allowed parameters are: ${allowedParameters.join(', ')}`);
    process.exit(1);
  }
});

console.log('Generating response');
const functionCalls = await generateContent(systemPrompt, codeGenPrompt);
console.log('Received function calls:', functionCalls);

// read --dry-run flag from command line
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('Dry run mode, not updating files');
} else {
  console.log('Update files');
  updateFiles(functionCalls);
  console.log('Done!');
}
