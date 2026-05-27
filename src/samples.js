/**
 * Local sample loading for Rendel.
 *
 * Dirt-Samples (218 packs) are stored in the `samples/` directory.
 * Superdough tries to fetch sample WAVs via `fetch()`, but the registered
 * URLs are relative paths like "bd/BT0A0A7.wav".  Node.js `fetch` does not
 * support `file://` URLs, so we monkey-patch it to resolve relative paths
 * against the local samples directory.
 *
 * Usage:
 *   import { setupLocalSamples } from './samples.js';
 *   await setupLocalSamples();  // call once before rendering
 */
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerSampleSource } from 'superdough';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(__dirname, '../samples');
const SAMPLES_MAP_PATH = resolve(SAMPLES_DIR, 'strudel.json');

/** Number of sample packs loaded by the last setupLocalSamples() call. */
export let loadedPackCount = 0;

/**
 * Monkey-patch `globalThis.fetch` so that relative URLs are resolved against
 * the local `samples/` directory.  Absolute http(s) URLs pass through
 * unchanged.
 */
export function patchFetchForLocalSamples() {
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;

    // Handle file:// URLs directly
    if (url?.startsWith('file://')) {
      const filePath = decodeURIComponent(new URL(url).pathname);
      const data = await readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'audio/wav' },
      });
    }

    // Resolve relative URLs against the samples directory
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      const absPath = resolve(SAMPLES_DIR, url);
      try {
        const data = await readFile(absPath);
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        });
      } catch {
        // File not found locally — fall through to original fetch
      }
    }

    return origFetch(input, init);
  };
}

/**
 * Read `samples/strudel.json` and register every sample pack with superdough.
 * Call once at startup (idempotent — re-registration is safe).
 */
export function registerLocalSamples() {
  const map = JSON.parse(readFileSync(SAMPLES_MAP_PATH, 'utf8'));
  const baseUrl = map._base || `file://${SAMPLES_DIR}/`;

  let count = 0;
  for (const [name, files] of Object.entries(map)) {
    if (name === '_base') continue;
    registerSampleSource(name, files, { baseUrl });
    count++;
  }
  loadedPackCount = count;
  return count;
}

/**
 * One-shot setup: patch fetch + register all local samples.
 * Call once before rendering.
 */
export async function setupLocalSamples() {
  patchFetchForLocalSamples();
  const count = registerLocalSamples();
  return count;
}
