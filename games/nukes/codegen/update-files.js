import fs from 'fs';
import path from 'path';

import { sourceFiles } from './find-files.js';

/**
 * @param codegenResults Result of the code generation, a map of file paths to new content
 */
export function updateFiles(functionCalls) {
  for (const { filePath, newContent } of functionCalls) {
    // ignore files which are not located inside project directory (sourceFiles)
    if (!sourceFiles.includes(filePath) && !sourceFiles.some((file) => path.dirname(filePath) === path.dirname(file))) {
      console.log(`Skipping file: ${filePath}`);
      throw new Error(`File ${filePath} is not located inside project directory, something is wrong?`);
    }

    if (newContent === '') {
      console.log(`Removing file: ${filePath}`);
      fs.unlinkSync(filePath);
    } else {
      console.log(`Updating file: ${filePath}`);
      fs.writeFileSync(filePath, newContent, 'utf-8');
    }
  }
}
