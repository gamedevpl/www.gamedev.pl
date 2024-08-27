import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import { roadrollerPlugin, defaultViteBuildOptions } from 'js13k-vite-plugins';
import zipPack from 'vite-plugin-zip-pack';
import fs from 'fs';
import assert from 'assert';

// https://stackoverflow.com/a/74395702
const noAttr = () => {
  return {
    name: 'no-attribute',
    transformIndexHtml(html) {
      return html.replace(`type="module" crossorigin`, '');
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: defaultViteBuildOptions,
  plugins: [
    checker({ typescript: true }),
    noAttr(),
    roadrollerPlugin(),
    zipPack({
      outFileName: 'monster-steps.zip',
      done: () => {
        const size = fs.statSync('dist-zip/monster-steps.zip').size;
        assert(size / 1024 <= 13, 'monster-steps.zip size(' + size / 1024 + 'KB) must be below 13KB');
      },
    }),
  ],
});
