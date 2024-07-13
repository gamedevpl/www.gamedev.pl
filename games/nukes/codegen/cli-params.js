import fs from 'fs';

const params = process.argv.slice(2);

export const dryRun = params.includes('--dry-run');
export const considerAllFiles = params.includes('--consider-all-files');
export const allowFileCreate = params.includes('--allow-file-create');
export const allowFileDelete = params.includes('--allow-file-delete');
export const codegenOnly = params.includes('--codegen-only');
export const gameOnly = params.includes('--game-only');
export const chatGpt = params.includes('--chat-gpt');
export let explicitPrompt = params.find((param) => param.startsWith('--explicit-prompt'))?.split('=')[1];
export const taskFile = params.find((param) => param.startsWith('--task-file'))?.split('=')[1];

if (taskFile) {
  if (explicitPrompt) {
    throw new Error('The --task-file option is exclusive with the --explicit-prompt option');
  }
  if (!fs.existsSync(taskFile)) {
    throw new Error(`The task file ${taskFile} does not exist`);
  }
  explicitPrompt = `I want you to perform a coding task. The task is described in the ${taskFile} file. Use those instructions.`;
}
