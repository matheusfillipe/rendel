/**
 * Unit tests for the renderer — pattern evaluation, buffer output, chunking.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureScope, renderCode, evaluatePattern, renderToBuffer } from './helpers/fixtures.js';
import { getRMS, getPeak, isSilent } from './helpers/audio.js';

describe('evaluatePattern', () => {
  beforeAll(ensureScope);

  it('returns a Pattern for valid code', async () => {
    const pattern = await evaluatePattern('s("bd")');
    expect(pattern).toBeDefined();
    expect(typeof pattern.queryArc).toBe('function');
  });

  it('throws for syntactically invalid code', async () => {
    await expect(evaluatePattern('s("bd"')).rejects.toThrow();
  });

  it('throws for code that does not return a pattern', async () => {
    await expect(evaluatePattern('42')).rejects.toThrow(/did not return.*Pattern/i);
  });

  it('handles multi-layer patterns with add', async () => {
    const pattern = await evaluatePattern('s("bd").add(s("hh"))');
    expect(pattern).toBeDefined();
    expect(typeof pattern.queryArc).toBe('function');
  });

  it('handles complex mini-notation', async () => {
    const pattern = await evaluatePattern('s("bd [sd bd] hh*4 ~ cp")');
    expect(pattern).toBeDefined();
  });

  it('handles note patterns', async () => {
    const pattern = await evaluatePattern('note("c3 e3 g3").s("sawtooth")');
    expect(pattern).toBeDefined();
  });

  it('auto-wraps comma-separated patterns in stack()', async () => {
    // JS comma operator returns only last expression — we fix this
    const pattern = await evaluatePattern('s("bd").gain(0.8), s("hh*4").gain(0.3)');
    expect(pattern).toBeDefined();
    const buf = await renderToBuffer(pattern, { duration: 2 });
    const rms = getRMS(buf);
    // Both layers should be audible — RMS must be substantial
    expect(rms).toBeGreaterThan(0.05);
  });

  it('auto-wraps comma after setcps', async () => {
    const pattern = await evaluatePattern('setcps(0.5)\ns("bd*4").gain(0.8), s("hh*4").gain(0.3)');
    expect(pattern).toBeDefined();
    const buf = await renderToBuffer(pattern, { duration: 2 });
    const rms = getRMS(buf);
    expect(rms).toBeGreaterThan(0.05);
  });

  it('comma-separated sounds same as explicit stack()', async () => {
    const commaBuf = await renderCode('s("bd*4").gain(0.8), s("hh*4").gain(0.3)', { duration: 2 });
    const stackBuf = await renderCode('stack(s("bd*4").gain(0.8), s("hh*4").gain(0.3))', { duration: 2 });
    const commaRMS = getRMS(commaBuf);
    const stackRMS = getRMS(stackBuf);
    // Should be within 10% of each other
    expect(Math.abs(commaRMS - stackRMS) / stackRMS).toBeLessThan(0.1);
  });
});

describe('renderToBuffer', () => {
  beforeAll(ensureScope);

  it('returns a buffer with correct length', async () => {
    const duration = 2;
    const sampleRate = 44100;
    const buf = await renderCode('note("c3").s("sine").gain(0.5)', { duration, sampleRate });
    expect(buf.sampleRate).toBe(sampleRate);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.getChannelData(0).length).toBe(duration * sampleRate);
  });

  it('returns stereo buffer (2 channels)', async () => {
    const buf = await renderCode('note("c3").s("sine")', { duration: 1 });
    expect(buf.numberOfChannels).toBe(2);
  });

  it('handles different durations', async () => {
    for (const dur of [1, 3, 5, 10]) {
      const buf = await renderCode('note("c3").s("sine").gain(0.3)', { duration: dur });
      expect(buf.getChannelData(0).length).toBe(dur * 44100);
    }
  });

  it('handles different sample rates', async () => {
    const buf = await renderCode('note("c3").s("sine").gain(0.3)', {
      duration: 1,
      sampleRate: 22050,
    });
    expect(buf.sampleRate).toBe(22050);
    expect(buf.getChannelData(0).length).toBe(22050);
  });
});

describe('chunking', () => {
  beforeAll(ensureScope);

  it('renders patterns longer than one chunk (3s) correctly', async () => {
    // 10 seconds = ceil(10/3) = 4 chunks
    const buf = await renderCode('note("c3").s("sine").gain(0.3)', { duration: 10 });
    expect(buf.getChannelData(0).length).toBe(10 * 44100);
    // Should not be silent — sine is continuous
    expect(isSilent(buf)).toBe(false);
  });

  it('output duration matches requested (±100ms)', async () => {
    const dur = 7.5;
    const buf = await renderCode('note("c3").s("sine").gain(0.3)', { duration: dur });
    const actualDur = buf.getChannelData(0).length / buf.sampleRate;
    expect(Math.abs(actualDur - dur)).toBeLessThan(0.1);
  });
});

describe('error handling', () => {
  beforeAll(ensureScope);

  it('gracefully handles unknown sound names', async () => {
    // Should not throw — superdough logs a warning and falls back to triangle
    const buf = await renderCode('s("nonexistent_sound_xyz")', { duration: 1 });
    // Falls back to triangle synth, so should produce audio
    expect(buf).toBeDefined();
  });
});
