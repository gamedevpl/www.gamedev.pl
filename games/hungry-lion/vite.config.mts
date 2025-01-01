import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import genaicodeVite from 'genaicode/vite-plugin';
import { genaicodeTracker, deepseekAiService } from './genaicode_plugins';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [
    react(),
    checker({ typescript: true }),
    genaicodeVite(
      {
        imagen: 'vertex-ai',
        disableContextOptimization: false,
      },
      {
        plugins: [genaicodeTracker, deepseekAiService],
      },
    ),
  ],
  publicDir: './src/public',
});
