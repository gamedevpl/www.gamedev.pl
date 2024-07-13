const params = process.argv.slice(2);

export const dryRun = params.includes('--dry-run');
export const considerAllFiles = params.includes('--consider-all-files');
export const allowFileCreate = params.includes('--allow-file-create');
export const allowFileDelete = params.includes('--allow-file-delete');
export const codegenOnly = params.includes('--codegen-only');
export const gameOnly = params.includes('--game-only');
export const chatGpt = params.includes('--chat-gpt');
