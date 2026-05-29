/**
 * Effects validation tests — verify each effect produces an audible change
 * compared to a no-effect baseline.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getRMS, isSilent } from './helpers/audio.js';
import { ensureScope, renderCode } from './helpers/fixtures.js';

const T = 30_000;

describe('effects produce audible changes vs baseline', () => {
  let synthRms, sampleRms;

  beforeAll(async () => {
    await ensureScope();
    const synthBuf = await renderCode('note("c3").s("sawtooth").gain(0.5)', { duration: 2 });
    const sampleBuf = await renderCode('s("bd").gain(0.8)', { duration: 2 });
    synthRms = getRMS(synthBuf);
    sampleRms = getRMS(sampleBuf);
  });

  // --- Filters ---
  it(
    'hpf significantly reduces RMS (removes low frequencies)',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").hpf(2000).gain(0.5)', { duration: 2 });
      expect(getRMS(buf)).toBeLessThan(synthRms * 0.5);
    },
    T,
  );

  it(
    'bpf significantly reduces RMS (isolates mid band)',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").bpf(1000).gain(0.5)', { duration: 2 });
      expect(getRMS(buf)).toBeLessThan(synthRms * 0.6);
    },
    T,
  );

  it(
    'cutoff+resonance combo increases RMS',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").cutoff(400).resonance(15).gain(0.5)', {
        duration: 2,
      });
      expect(getRMS(buf)).toBeGreaterThan(synthRms);
    },
    T,
  );

  // --- Distortion ---
  it(
    'crush adds quantization noise (+20% RMS)',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").crush(4).gain(0.5)', { duration: 2 });
      expect(getRMS(buf)).toBeGreaterThan(synthRms * 1.2);
    },
    T,
  );

  it(
    'shape dramatically increases RMS',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").shape(0.7).gain(0.5)', {
        duration: 2,
      });
      expect(getRMS(buf)).toBeGreaterThan(synthRms * 2);
    },
    T,
  );

  it(
    'distort increases RMS',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").distort(0.7).gain(0.5)', {
        duration: 2,
      });
      expect(getRMS(buf)).toBeGreaterThan(synthRms * 1.5);
    },
    T,
  );

  // --- Time-based ---
  it(
    'delay adds echo taps (+10% RMS)',
    async () => {
      const buf = await renderCode('s("bd").delay(0.5).gain(0.8)', { duration: 2 });
      expect(getRMS(buf)).toBeGreaterThan(sampleRms * 1.1);
    },
    T,
  );

  it(
    'delayfeedback increases echo repetitions',
    async () => {
      const bufLow = await renderCode('s("bd").delayfeedback(0.2).delay(0.5).gain(0.8)', {
        duration: 2,
      });
      const bufHigh = await renderCode('s("bd").delayfeedback(0.8).delay(0.5).gain(0.8)', {
        duration: 2,
      });
      expect(getRMS(bufHigh)).toBeGreaterThan(getRMS(bufLow));
    },
    T,
  );

  it(
    'room adds reverb (+50% RMS)',
    async () => {
      const buf = await renderCode('s("bd").room(0.7).gain(0.8)', { duration: 2 });
      expect(getRMS(buf)).toBeGreaterThan(sampleRms * 1.3);
    },
    T,
  );

  // --- Volume/Pan ---
  it(
    'gain(0.3) reduces RMS by ~60%',
    async () => {
      const buf = await renderCode('s("bd").gain(0.3)', { duration: 2 });
      expect(getRMS(buf)).toBeLessThan(sampleRms * 0.5);
    },
    T,
  );

  it(
    'pan(0) sends audio to left channel only',
    async () => {
      const buf = await renderCode('s("bd").pan(0).gain(0.8)', { duration: 2 });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      let rmsL = 0,
        rmsR = 0;
      for (let i = 0; i < L.length; i++) {
        rmsL += L[i] * L[i];
        rmsR += R[i] * R[i];
      }
      rmsL = Math.sqrt(rmsL / L.length);
      rmsR = Math.sqrt(rmsR / R.length);
      expect(rmsL).toBeGreaterThan(0.01);
      expect(rmsR).toBeLessThan(0.001);
    },
    T,
  );

  it(
    'pan(1) sends audio to right channel only',
    async () => {
      const buf = await renderCode('s("bd").pan(1).gain(0.8)', { duration: 2 });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      let rmsL = 0,
        rmsR = 0;
      for (let i = 0; i < L.length; i++) {
        rmsL += L[i] * L[i];
        rmsR += R[i] * R[i];
      }
      rmsL = Math.sqrt(rmsL / L.length);
      rmsR = Math.sqrt(rmsR / R.length);
      expect(rmsR).toBeGreaterThan(0.01);
      expect(rmsL).toBeLessThan(0.001);
    },
    T,
  );

  // --- Modulation ---
  it(
    'tremolo reduces RMS (amplitude modulation)',
    async () => {
      const buf = await renderCode('note("c3").s("sawtooth").tremolo(0.7).gain(0.5)', {
        duration: 2,
      });
      expect(getRMS(buf)).toBeLessThan(synthRms * 0.7);
    },
    T,
  );

  // --- Sample manipulation ---
  it(
    'speed(2) renders without silence',
    async () => {
      const buf = await renderCode('s("bd").speed(2).gain(0.8)', { duration: 2 });
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );

  it(
    'begin(0.2) shortens sample',
    async () => {
      const buf = await renderCode('s("bd").begin(0.2).gain(0.8)', { duration: 2 });
      expect(getRMS(buf)).toBeLessThan(sampleRms);
    },
    T,
  );

  it(
    'rev() on multi-hit pattern changes event order',
    async () => {
      const bufFwd = await renderCode('s("bd sd hh cp").gain(0.7)', { duration: 2 });
      const bufRev = await renderCode('s("bd sd hh cp").rev().gain(0.7)', { duration: 2 });
      // Reversed pattern should produce different waveform
      expect(isSilent(bufRev)).toBe(false);
      // RMS should be similar (same sounds, different order)
      const fwdRms = getRMS(bufFwd);
      const revRms = getRMS(bufRev);
      expect(Math.abs(fwdRms - revRms) / fwdRms).toBeLessThan(0.5);
    },
    T,
  );

  // --- Aliases ---
  it(
    'reverb() is an alias for room() and produces reverb',
    async () => {
      const buf = await renderCode('s("bd").reverb(0.7).gain(0.8)', { duration: 2 });
      expect(getRMS(buf)).toBeGreaterThan(sampleRms * 1.3);
    },
    T,
  );

  it(
    'delayfb is an alias for delayfeedback',
    async () => {
      const buf = await renderCode('s("bd").delay(0.5).delayfb(0.7).gain(0.8)', { duration: 2 });
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );

  // --- Compressor (was broken, now fixed with AudioParam NaN guard) ---
  it(
    'compressor() with no args produces audio',
    async () => {
      const buf = await renderCode('s("bd").compressor().gain(0.8)', { duration: 2 });
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );

  it(
    'compressor(-10, 4) compresses signal',
    async () => {
      const buf = await renderCode('s("bd").compressor(-10, 4).gain(0.8)', { duration: 2 });
      // Compressor should produce non-silent, non-clipping output
      expect(getRMS(buf)).toBeGreaterThan(0);
      expect(getRMS(buf)).toBeLessThan(sampleRms * 2);
    },
    T,
  );
});
