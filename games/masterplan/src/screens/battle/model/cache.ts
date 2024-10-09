import * as fs from 'fs';
import * as crypto from 'node:crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_FILE_PATH = path.join(__dirname, 'simulate.cache.json');

export function calculateMD5(data: any): string {
  const json = JSON.stringify(data);
  return crypto.createHash('md5').update(json).digest('hex');
}

export function readCache(): Record<string, any> {
  try {
    const cacheData = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
    return JSON.parse(cacheData);
  } catch (error) {
    return {};
  }
}

export function writeCache(cache: Record<string, any>): void {
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
}
