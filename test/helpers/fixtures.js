/**
 * Shared test fixtures — scope setup, render helper, etc.
 * Imported by all test files so we only set up the Strudel scope once.
 */
import { setupScope, evaluatePattern, renderToBuffer } from '../../src/renderer.js';

let scopeReady = false;

/** Ensure the Strudel scope is initialized (call in beforeAll or before). */
export async function ensureScope() {
  if (!scopeReady) {
    await setupScope();
    scopeReady = true;
  }
}

/** Evaluate a pattern string and render it to a buffer. */
export async function renderCode(code, { duration = 2, cps = 1, sampleRate = 44100 } = {}) {
  const pattern = await evaluatePattern(code);
  return renderToBuffer(pattern, { duration, cps, sampleRate, verbose: false });
}

/** Just evaluate a pattern (no render). */
export { evaluatePattern, renderToBuffer };
