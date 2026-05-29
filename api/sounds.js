import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GM_INSTRUMENTS, GM_NICKNAMES } from '../src/gm-instruments.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SAMPLES_MAP = join(ROOT, 'samples', 'strudel.json');

// Built-in synth voices the engine always provides (independent of the sample library).
const SYNTHS = ['sine', 'sawtooth', 'square', 'triangle', 'supersaw', 'white', 'pink', 'brown'];

let cache = null;

// The catalog of sounds this renderer can actually play, so a caller can
// discover what to use instead of guessing. Sample packs come from the baked
// library, soundfonts from the shared GM list, synths are built in.
export async function getSounds() {
  if (cache) return cache;
  let samples = [];
  try {
    const map = JSON.parse(await readFile(SAMPLES_MAP, 'utf8'));
    samples = Object.keys(map)
      .filter((name) => name !== '_base')
      .sort();
  } catch {
    /* no local sample index available → empty list */
  }
  const soundfonts = [...GM_INSTRUMENTS, ...Object.keys(GM_NICKNAMES)].sort();
  cache = {
    synths: SYNTHS,
    soundfonts,
    samples,
    counts: {
      synths: SYNTHS.length,
      soundfonts: soundfonts.length,
      samples: samples.length,
    },
    usage:
      'Play any name with s("name") or .sound("name"). Sample packs accept a ' +
      'variant index (s("name:2")) and repetition (s("name*4")). Soundfonts and ' +
      'synths are pitched — drive them with note("c e g") or n("0 2 4").scale(...).',
  };
  return cache;
}
