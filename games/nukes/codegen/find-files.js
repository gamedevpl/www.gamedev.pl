import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const codegenDir = path.join(__dirname);
const srcDir = path.join(__dirname, '..', 'src');

function findFiles(dir, ...exts) {
  const files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...findFiles(fullPath, ...exts));
    } else if (exts.includes(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

const jsFiles = findFiles(codegenDir, '.js');
const tsFiles = findFiles(srcDir, '.ts', '.tsx');

export const sourceFiles = [...jsFiles, ...tsFiles];
