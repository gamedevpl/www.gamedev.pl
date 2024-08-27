import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import { roadrollerPlugin, defaultViteBuildOptions } from 'js13k-vite-plugins';
import zipPack from 'vite-plugin-zip-pack';

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
  plugins: [checker({ typescript: true }), noAttr(), roadrollerPlugin(), zipPack()],
});
