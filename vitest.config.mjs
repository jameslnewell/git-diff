import {defineConfig, mergeConfig} from 'vitest/config';
import config from '@jameslnewell/vitest-config';

export default mergeConfig(
  config,
  defineConfig({
    test: {
      // the integration tests create and diff real git repositories
      testTimeout: 30_000,
    },
  }),
);
