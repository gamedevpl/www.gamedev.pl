import fs from 'fs';

import { sourceFiles } from './find-files.js';

/**
 * @param codegenResults Result of the code generation, a map of file paths to new content
 */
export function updateFiles(codegenResults) {
  for (const [filePath, newContent] of Object.entries(codegenResults)) {
    // ignore files which are not located inside project directory (sourceFiles)
    if (!sourceFiles.includes(filePath)) {
      console.log(`Skipping file: ${filePath}`);
      throw new Error(`File ${filePath} is not located inside project directory, something is wrong?`);
    }

    console.log(`Updating file: ${filePath}`);
    fs.writeFileSync(filePath + '.codegen', newContent, 'utf-8');
  }
}
