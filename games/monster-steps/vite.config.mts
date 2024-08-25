import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import checker from 'vite-plugin-checker';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [preact(), checker({ typescript: true })],
});
