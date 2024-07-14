import assert from 'node:assert';
import { getSourceCode } from './read-files.js';
import { CODEGEN_TRIGGER } from './prompt-consts.js';
import {
  considerAllFiles,
  allowFileCreate,
  allowFileDelete,
  explicitPrompt,
  dependencyTree,
  verbosePrompt,
} from './cli-params.js';
import { getDependencyList } from './find-files.js';
import { verifyCodegenPromptLimit } from './limits.js';

/** Get codegen prompt */
export function getCodeGenPrompt() {
  let codeGenFiles;
  if (considerAllFiles) {
    codeGenFiles = Object.keys(getSourceCode());
  } else {
    codeGenFiles = Object.entries(getSourceCode())
      .filter(([path, content]) => content.match(new RegExp("([^'^`]+)" + CODEGEN_TRIGGER)))
      .map(([path]) => path);
  }

  // Add logic to consider dependency tree
  if (dependencyTree) {
    assert(codeGenFiles.length > 0, `You must use ${CODEGEN_TRIGGER} together with --dependency-tree`);

    const dependencyTreeFiles = new Set();
    codeGenFiles
      .map(getDependencyList)
      .flat()
      .forEach((key) => dependencyTreeFiles.add(key));
    codeGenFiles = Array.from(dependencyTreeFiles);
  }

  const codeGenPrompt =
    (explicitPrompt ? explicitPrompt + '\n\n' : '') +
    `${
      considerAllFiles
        ? codeGenFiles.length > 0
          ? `I have marked some files with the ${CODEGEN_TRIGGER} fragments:\n${codeGenFiles.join('\n')}`
          : `No files are marked with ${CODEGEN_TRIGGER} fragment, so you can consider doing changes in any file.`
        : `Generate updates only for the following files:\n${codeGenFiles.join('\n')}`
    }

${
  considerAllFiles
    ? 'You are allowed to modify all files in the application regardless if they contain codegen fragments or not.'
    : 'Do not modify files which do not contain the fragments.'
}
${allowFileCreate ? 'You are allowed to create new files.' : 'Do not create new files.'}
${
  allowFileDelete
    ? 'You are allowed to delete files, in such case add empty string as content.'
    : 'Do not delete files, empty content means something would be deleted.'
}
Do not output files if there are no changes.
Call the \`explanation\` function to explain reason for changes or reason for lack of changes.
Call the \`updateFile\` function for code changes.
`;

  if (verbosePrompt) {
    console.log('Code gen prompt:');
    console.log(codeGenPrompt);
  }

  verifyCodegenPromptLimit(codeGenPrompt);

  return codeGenPrompt;
}