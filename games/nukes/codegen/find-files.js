import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const codegenDir = path.join(__dirname);
const srcDir = path.join(__dirname, '..', 'src');
const rootDir = path.join(__dirname, '..');

function findFiles(dir, recursive, ...exts) {
  const files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      if (recursive) {
        files.push(...findFiles(fullPath, ...exts));
      }
    } else if (exts.includes(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

const rootFiles = findFiles(rootDir, false, '.md');
const codegenFiles = findFiles(codegenDir, true, '.js', '.md');
const gameFiles = findFiles(srcDir, true, '.ts', '.tsx', '.md');

export const sourceFiles = [...rootFiles, ...codegenFiles, ...gameFiles];
