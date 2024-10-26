import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import genaicodeVite from 'genaicode/vite-plugin';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [
    react(),
    checker({ typescript: true }),
    genaicodeVite({
      imagen: 'vertex-ai',
      disableInitialLint: true,
    }),
  ],
  publicDir: './src/public',
});
