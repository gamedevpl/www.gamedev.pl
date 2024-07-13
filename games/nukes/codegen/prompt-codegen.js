import assert from 'node:assert';
import { getSourceCode } from './read-files.js';
import { CODEGEN_TRIGGER } from './prompt-consts.js';

const considerAllFiles = process.argv.includes('--consider-all-files');
const allowFileCreate = process.argv.includes('--allow-file-create');
const allowFileDelete = process.argv.includes('--allow-file-delete');

/** Get codegen prompt */
export function getCodeGenPrompt() {
  const codeGenFiles = Object.entries(getSourceCode())
    .filter(([path, content]) => content.includes(CODEGEN_TRIGGER))
    .map(([path]) => path);

  if (!considerAllFiles) {
    assert(codeGenFiles.length > 0, 'No codegen files found');
    console.log('Code gen files:');
    console.log(codeGenFiles);
  }

  const codeGenPrompt = `${
    considerAllFiles
      ? codeGenFiles.length > 0
        ? `I have marked some files with the ${CODEGEN_TRIGGER} fragments:\n${codeGenFiles.join('\n')}`
        : `No files are marked with ${CODEGEN_TRIGGER} fragment, so you can consider doing changes in any file.`
      : `Generate updates only for the following files:\n${codeGenFiles.join('\n')}`
  }

${
  considerAllFiles
    ? 'You are allowed to modify files which do not contain the fragments.'
    : 'Do not modify files which do not contain the fragments.'
}
${allowFileCreate ? 'You are allowed to create new files.' : 'Do not create new files.'}
${
  allowFileDelete
    ? 'You are allowed to delete files, in such case add empty string for their path in output JSON.'
    : 'Do not delete files, empty content means something would be deleted.'
}
Do not output files if there are no changes.
If there are no files to be changed, do not call \`updateFile\` function, but make sure the explain your reasoning with \`explanation\` function.
`;

  console.log('Code gen prompt:');
  console.log(codeGenPrompt);

  return codeGenPrompt;
}
