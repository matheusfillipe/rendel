#!/usr/bin/env node
/**
 * Post-install patch for @kabelsalat/web ESM exports.
 * Without this, Node.js can't resolve named exports from the package.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', '@kabelsalat', 'web', 'package.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.exports) {
    console.log('[rendel-patch] @kabelsalat/web already has exports map, skipping');
    process.exit(0);
  }
  pkg.exports = {
    '.': {
      import: './dist/index.mjs',
      require: './dist/index.js',
    },
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[rendel-patch] Added exports map to @kabelsalat/web');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log('[rendel-patch] @kabelsalat/web not found, skipping');
    process.exit(0);
  }
  throw err;
}
