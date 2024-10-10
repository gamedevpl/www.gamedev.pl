import * as fs from 'fs';
import * as crypto from 'node:crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function calculateMD5(data: any): string {
  const json = JSON.stringify(data);
  return crypto.createHash('md5').update(json).digest('hex');
}

function getCacheFilePath(fileName: string): string {
  return path.join(__dirname, fileName);
}

function readCache<T>(fileName: string, defaultValue: T): T {
  const cacheFilePath = getCacheFilePath(fileName);
  try {
    const cacheData = fs.readFileSync(cacheFilePath, 'utf-8');
    return JSON.parse(cacheData);
  } catch (error) {
    return defaultValue;
  }
}

function writeCache<T>(fileName: string, cache: T): void {
  const cacheFilePath = getCacheFilePath(fileName);
  fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
}

export function getCache<T>(fileName: string, defaultValue: T) {
  return {
    readCache: () => readCache(fileName, defaultValue),
    writeCache: (cache: T) => writeCache(fileName, cache),
  };
}
