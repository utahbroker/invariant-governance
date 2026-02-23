// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  outDir: 'dist',
});
