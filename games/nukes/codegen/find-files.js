import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { codegenOnly, gameOnly } from './cli-params.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const codegenDir = path.join(__dirname);
const srcDir = path.join(__dirname, '..', 'src');
const rootDir = path.join(__dirname, '..');
const tasksDir = path.join(__dirname, '..', 'tasks');

function findFiles(dir, recursive, ...exts) {
  const files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      if (recursive) {
        files.push(...findFiles(fullPath, true, ...exts));
      }
    } else if (exts.includes(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

const rootFiles = findFiles(rootDir, false, '.md');
const taskFiles = findFiles(tasksDir, true, '.md');
const codegenFiles = findFiles(codegenDir, true, '.js', '.md');
const gameFiles = findFiles(srcDir, true, '.ts', '.tsx', '.md');

/** Get source files of the application */
export function getSourceFiles() {
  if (codegenOnly) {
    return [...rootFiles, ...taskFiles, ...codegenFiles];
  }
  if (gameOnly) {
    return [...rootFiles, ...taskFiles, ...gameFiles];
  }
  return [...rootFiles, ...codegenFiles, ...gameFiles];
}
