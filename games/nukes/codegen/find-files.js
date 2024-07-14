import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { codegenOnly, gameOnly } from './cli-params.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const codegenDir = path.join(__dirname);
const srcDir = path.join(__dirname, '..', 'src');
const rootDir = path.join(__dirname, '..');
const docsDir = path.join(__dirname, '..', 'docs');

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

function getDependencies(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const dependencyRegex = /import\s+.+?\s+from\s+['"](.+?)['"]/g;
  const dependencies = [];
  let match;
  while ((match = dependencyRegex.exec(content)) !== null) {
    const dependencyPath = match[1];
    // Resolve relative paths from the file's directory
    let resolvedPath = path.resolve(path.dirname(filePath), dependencyPath);

    // Only add the dependency if it's a local file and not a module
    if (fs.existsSync(resolvedPath)) {
      dependencies.push(resolvedPath);
    } else {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        if (fs.existsSync(resolvedPath + '.ts')) {
          dependencies.push(resolvedPath + '.ts');
        }
        if (fs.existsSync(resolvedPath + '.tsx')) {
          dependencies.push(resolvedPath + '.tsx');
        }
      }
    }
  }
  return dependencies;
}

/** Generates a dependency list for given file */
export function getDependencyList(entryFile) {
  const visitedFiles = new Set();
  const result = new Set();

  function traverse(file) {
    if (visitedFiles.has(file)) return;
    visitedFiles.add(file);
    const dependencies = getDependencies(file);
    dependencies.forEach((dependency) => result.add(dependency));
    dependencies.forEach(traverse);
  }

  result.add(path.resolve(entryFile));
  traverse(entryFile);

  return Array.from(result);
}

const rootFiles = findFiles(rootDir, false, '.md');
const docsFiles = findFiles(docsDir, true, '.md');
const codegenFiles = findFiles(codegenDir, true, '.js', '.md');
const gameFiles = findFiles(srcDir, true, '.ts', '.tsx', '.md');

/** Get source files of the application */
export function getSourceFiles() {
  if (codegenOnly) {
    return [...rootFiles, ...docsFiles, ...codegenFiles];
  }
  if (gameOnly) {
    return [...rootFiles, ...docsFiles, ...gameFiles];
  }
  return [...rootFiles, ...codegenFiles, ...gameFiles];
}
