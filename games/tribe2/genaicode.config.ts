import { defineConfig } from 'genaicode';

export default defineConfig({
  rootDir: '.',
  ignorePaths: [
    'dist',
    'node_modules',
    'package-lock.json',
    'tfmodel/weights.bin',
    'tfmodel/model.json',
    'result-chain.cache.json',
    'simulate.cache.json',
  ],
});
