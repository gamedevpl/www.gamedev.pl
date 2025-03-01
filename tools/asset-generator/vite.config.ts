import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import viteGenaicode from 'genaicode/vite-plugin';
import assetGeneratorPlugin from './src/plugins/vite-plugin-asset-generator';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [react(), checker({ typescript: true }), viteGenaicode({}), assetGeneratorPlugin()],
});
