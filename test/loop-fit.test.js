/**
 * Tests for loop-period detection and one-pass auto-fit rendering — the
 * mechanism that stops a finished song from restarting mid-file.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { detectLoopPeriod, evaluatePattern, renderToBuffer, setupScope } from '../src/renderer.js';

let scopeReady = false;
async function ensureScope() {
  if (!scopeReady) {
    await setupScope();
    scopeReady = true;
  }
}

describe('detectLoopPeriod', () => {
  beforeAll(ensureScope);

  it('returns 1 for a pattern that repeats every cycle', async () => {
    const pattern = await evaluatePattern('s("bd hh sd hh")');
    expect(detectLoopPeriod(pattern, { cps: 1, maxCycles: 16 })).toBe(1);
  });

  it('returns the slowcat length', async () => {
    const pattern = await evaluatePattern('s("<bd hh sd>")');
    expect(detectLoopPeriod(pattern, { cps: 1, maxCycles: 24 })).toBe(3);
  });

  it('returns the arrange total cycles', async () => {
    const pattern = await evaluatePattern('arrange([2, s("bd*2")], [3, s("hh*4")])');
    expect(detectLoopPeriod(pattern, { cps: 1, maxCycles: 32 })).toBe(5);
  });

  it('returns null for a non-repeating (random) pattern', async () => {
    const pattern = await evaluatePattern('s("bd*4").gain(rand)');
    expect(detectLoopPeriod(pattern, { cps: 1, maxCycles: 16 })).toBeNull();
  });
});

describe('renderToBuffer auto-fit', () => {
  beforeAll(ensureScope);

  it('without loopCycles, length equals the requested duration', async () => {
    const pattern = await evaluatePattern('s("bd*4")');
    const buf = await renderToBuffer(pattern, { duration: 4, cps: 1, sampleRate: 44100 });
    expect(buf.getChannelData(0).length).toBe(4 * 44100);
  });

  it('loopCycles drops onsets past the loop and trimSilence ends on the music', async () => {
    // bd*4 at cps 1 fires onsets through cycle 1.75; loopCycles=2 means nothing
    // should sound after ~2s even though we asked for 8s.
    const pattern = await evaluatePattern('s("bd*4")');
    const buf = await renderToBuffer(pattern, {
      duration: 8,
      cps: 1,
      sampleRate: 44100,
      loopCycles: 2,
      trimSilence: true,
    });
    // Trimmed well under the 8s request (one 2-cycle pass + short decay).
    expect(buf.duration).toBeLessThan(3);
    expect(buf.getChannelData(0).length).toBe(buf.duration * 44100);
  });

  it('region past the loop boundary is silent', async () => {
    const sampleRate = 44100;
    const pattern = await evaluatePattern('s("bd*4")');
    const buf = await renderToBuffer(pattern, {
      duration: 8,
      cps: 1,
      sampleRate,
      loopCycles: 2,
      trimSilence: false,
    });
    const L = buf.getChannelData(0);
    let energyAfter = 0;
    for (let i = Math.round(3 * sampleRate); i < L.length; i++) {
      energyAfter = Math.max(energyAfter, Math.abs(L[i]));
    }
    expect(energyAfter).toBeLessThan(0.01);
  });
});
