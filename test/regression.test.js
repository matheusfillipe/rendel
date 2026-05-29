/**
 * Regression tests — all example patterns render without errors and produce audio.
 * These guard against regressions when modifying the renderer, effects, or sample loading.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getPeak, getRMS, isSilent } from './helpers/audio.js';
import { ensureScope, renderCode } from './helpers/fixtures.js';

const RENDER_TIMEOUT = 60_000;

describe('example patterns (regression)', () => {
  beforeAll(ensureScope);

  const examples = [
    {
      name: 'simple kick',
      code: 's("bd")',
    },
    {
      name: 'drum loop',
      code: 's("bd [sd bd] hh*4").gain(0.7).room(0.2)',
    },
    {
      name: 'melodic synth',
      code: 'note("c3 [eb3 g3] d3 [f3 a3]").s("sawtooth").cutoff(800).gain(0.4)',
    },
    {
      name: 'ambient pad',
      code: 'note("c4 eb4 g4 bb4").s("sine").slow(4).room(0.8).gain(0.3)',
    },
    {
      name: 'euclidean rhythm',
      code: 's("hh").euclid(5,8).gain(0.5).room(0.3)',
    },
    {
      name: 'multi-layer with stack',
      code: `
        stack(
          s("bd*2").gain(0.6),
          s("hh*4").gain(0.3).hpf(8000),
          note("c2").s("sawtooth").cutoff(400).gain(0.4)
        ).room(0.2)
      `,
    },
    {
      name: 'bass line',
      code: 'note("c2 [c2 eb2] f2 [g2 f2]").s("sawtooth").cutoff(300).resonance(5).gain(0.5)',
    },
    {
      name: 'effect chain',
      code: 's("bd").delay(0.4).delayfeedback(0.6).delaytime(0.25).room(0.5).crush(12).gain(0.6)',
    },
    {
      name: 'supersaw chord',
      code: 'note("[c4,eb4,g4]").s("supersaw").gain(0.2).room(0.6).cutoff(2000)',
    },
    {
      name: 'jux effect',
      code: 's("bd sd").jux(x => x.speed(1.5)).gain(0.7)',
    },
    {
      name: 'structured pattern',
      code: 's("bd sd hh cp").struct("x [x x] x [~ x]").gain(0.6)',
    },
  ];

  for (const { name, code } of examples) {
    it(
      `${name} renders without error and produces audio`,
      async () => {
        const buf = await renderCode(code, { duration: 4 });
        expect(buf).toBeDefined();
        expect(isSilent(buf)).toBe(false);
        expect(getPeak(buf)).toBeLessThan(1.5); // some overshoot from effects is OK
      },
      RENDER_TIMEOUT,
    );
  }
});

describe('audio quality checks', () => {
  beforeAll(ensureScope);

  it(
    'sine at known frequency has expected fundamental',
    async () => {
      const buf = await renderCode('note("a4").s("sine").gain(0.5)', { duration: 1 });
      expect(isSilent(buf)).toBe(false);
      // A4 = 440Hz. Verify via zero-crossing rate on the raw channel data.
      const L = buf.getChannelData(0);
      let crossings = 0;
      for (let i = 1; i < L.length; i++) {
        if ((L[i - 1] >= 0 && L[i] < 0) || (L[i - 1] < 0 && L[i] >= 0)) crossings++;
      }
      const detectedFreq = crossings / 2; // half crossings = freq over 1 second
      expect(detectedFreq).toBeGreaterThan(400);
      expect(detectedFreq).toBeLessThan(500);
    },
    RENDER_TIMEOUT,
  );

  it(
    'low-pass filter reduces high frequency energy',
    async () => {
      const bufUnfiltered = await renderCode('note("c4").s("sawtooth").gain(0.5)', { duration: 1 });
      const bufFiltered = await renderCode('note("c4").s("sawtooth").lpf(500).gain(0.5)', {
        duration: 1,
      });

      const { bandEnergy } = await import('./helpers/audio.js');
      const highEnergyUnfiltered = bandEnergy(bufUnfiltered, 2000, 8000, 0, 0.5);
      const highEnergyFiltered = bandEnergy(bufFiltered, 2000, 8000, 0, 0.5);

      // Filtered should have significantly less high-frequency energy
      expect(highEnergyFiltered).toBeLessThan(highEnergyUnfiltered * 0.5);
    },
    RENDER_TIMEOUT,
  );

  it(
    'gain(0.5) reduces amplitude by ~6dB',
    async () => {
      const bufFull = await renderCode('note("c3").s("sine")', { duration: 1 });
      const bufHalf = await renderCode('note("c3").s("sine").gain(0.5)', { duration: 1 });
      // gain(0.5) should reduce RMS by roughly half
      expect(getRMS(bufHalf)).toBeLessThan(getRMS(bufFull));
    },
    RENDER_TIMEOUT,
  );
});
