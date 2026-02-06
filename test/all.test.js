/**
 * Fibjs test entrypoint - delegate to Node for ESM/TS support.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const nodeBinary = process.env.NODE_BINARY || 'node';
const testEntry = path.resolve(__dirname, 'all.test.mjs');

const result = spawnSync(nodeBinary, ['--import', 'tsx/esm', testEntry], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
