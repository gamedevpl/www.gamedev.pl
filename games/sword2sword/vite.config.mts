import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import wasm from 'vite-plugin-wasm';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'build',
    target: 'esnext',
  },
  resolve: {
    preserveSymlinks: true,
  },
  plugins: [react(), wasm(), checker({ typescript: true })],
});
