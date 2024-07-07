import fs from 'fs';

import { sourceFiles } from './find-files.js';

/**
 * Read contents of source files and create a map with file path as key and file content as value
 */
function readSourceFiles() {
  const sourceCode = {};
  for (const file of sourceFiles) {
    sourceCode[file] = fs.readFileSync(file, 'utf-8');
  }
  return sourceCode;
}

export const sourceCode = readSourceFiles();
