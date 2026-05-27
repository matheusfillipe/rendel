#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d "samples/bd" ]; then
  echo "Samples already exist in samples/"
  exit 0
fi

echo "Cloning Dirt-Samples (shallow, ~175MB)..."
git clone --depth 1 https://github.com/tidalcycles/Dirt-Samples.git samples

echo "Generating strudel.json..."
node -e "
const fs = require('fs');
const path = require('path');
const samplesDir = path.resolve('samples');
const dirs = fs.readdirSync(samplesDir).filter(f => 
  fs.statSync(path.join(samplesDir, f)).isDirectory()
);
const map = { _base: 'file://' + samplesDir + '/' };
let total = 0;
for (const dir of dirs) {
  const files = fs.readdirSync(path.join(samplesDir, dir))
    .filter(f => /\.(wav|mp3|flac|ogg|WAV|MP3|FLAC|OGG)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (files.length > 0) { map[dir] = files.map(f => dir + '/' + f); total += files.length; }
}
fs.writeFileSync(path.join(samplesDir, 'strudel.json'), JSON.stringify(map, null, 2));
console.log('Generated strudel.json:', Object.keys(map).length - 1, 'packs,', total, 'files');
"

echo "Done! Samples ready."
