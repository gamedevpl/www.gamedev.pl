import { defineConfig, mergeConfig } from 'vitest/config';
import rootConfig from '../../vitest.config.js';

export default mergeConfig(rootConfig, defineConfig({ test: { testTimeout: 20_000, hookTimeout: 20_000 } }));
