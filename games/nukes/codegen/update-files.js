import fs from 'fs';
import path from 'path';

import { getSourceFiles } from './find-files.js';
import { chatGpt } from './cli-params.js';

/**
 * @param codegenResults Result of the code generation, a map of file paths to new content
 */
export function updateFiles(functionCalls) {
  const sourceFiles = getSourceFiles();

  for (const { filePath, newContent } of functionCalls) {
    // ignore files which are not located inside project directory (sourceFiles)
    if (
      !sourceFiles.includes(filePath) &&
      !sourceFiles.some(
        (sourceFile) =>
          path.dirname(filePath) === path.dirname(sourceFile) ||
          isAncestorDirectory(path.dirname(sourceFile), path.dirname(filePath)),
      )
    ) {
      console.log(`Skipping file: ${filePath}`);
      throw new Error(`File ${filePath} is not located inside project directory, something is wrong?`);
    }

    if (newContent === '') {
      console.log(`Removing file: ${filePath}`);
      fs.unlinkSync(filePath);
    } else {
      console.log(`Updating file: ${filePath}`);
      fs.writeFileSync(
        filePath,
        // Fixing a problem caused by vertex function calling. Possible not a good fix
        chatGpt ? newContent : newContent.replace(/\\n/g, '\n').replace(/\\'/g, "'"),
        'utf-8',
      );
    }
  }
}

function isAncestorDirectory(parent, dir) {
  const relative = path.relative(parent, dir);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
