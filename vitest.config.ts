// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
  },
});
