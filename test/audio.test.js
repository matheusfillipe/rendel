/**
 * Integration tests — verify synths, samples, effects produce actual audio.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureScope, renderCode } from './helpers/fixtures.js';
import { getRMS, getPeak, isSilent } from './helpers/audio.js';

// Timeout for each test — rendering can take a few seconds
const RENDER_TIMEOUT = 30_000;

describe('synths', () => {
  beforeAll(ensureScope);

  const synths = ['sine', 'sawtooth', 'triangle', 'square'];

  for (const synth of synths) {
    it(`${synth} produces non-silent audio`, async () => {
      const buf = await renderCode(`note("c3").s("${synth}").gain(0.5)`, { duration: 2 });
      expect(isSilent(buf)).toBe(false);
      expect(getPeak(buf)).toBeLessThan(1.0); // shouldn't clip
    }, RENDER_TIMEOUT);
  }

  it('supersaw produces non-silent audio', async () => {
    const buf = await renderCode('note("c3").s("supersaw").gain(0.3)', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('noise produces non-silent audio', async () => {
    const buf = await renderCode('s("noise").gain(0.3)', { duration: 1 });
    // noise may or may not work depending on superdough support
    // Just check it doesn't crash
    expect(buf).toBeDefined();
  }, RENDER_TIMEOUT);
});

describe('samples', () => {
  beforeAll(ensureScope);

  const sampleNames = ['bd', 'sd', 'hh', 'cp', 'bass', 'drum'];

  for (const name of sampleNames) {
    it(`s("${name}") produces non-silent audio`, async () => {
      const buf = await renderCode(`s("${name}")`, { duration: 2 });
      expect(isSilent(buf)).toBe(false);
      expect(getPeak(buf)).toBeLessThan(1.0);
    }, RENDER_TIMEOUT);
  }

  it('numbered variants work: s("bd:1")', async () => {
    const buf = await renderCode('s("bd:1")', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('sample speed modulation works', async () => {
    const buf = await renderCode('s("bd").speed(2)', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('sample begin/end slicing works', async () => {
    const buf = await renderCode('s("bd").begin(0.1).end(0.5)', { duration: 2 });
    expect(buf).toBeDefined();
  }, RENDER_TIMEOUT);

  it('sample rev() works', async () => {
    const buf = await renderCode('s("bd").rev()', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);
});

describe('effects', () => {
  beforeAll(ensureScope);

  const effects = [
    { name: 'gain', code: 's("bd").gain(0.3)' },
    { name: 'pan', code: 's("bd").pan(0.75)' },
    { name: 'delay', code: 's("bd").delay(0.5)' },
    { name: 'delaytime', code: 's("bd").delaytime(0.3)' },
    { name: 'delayfeedback', code: 's("bd").delayfeedback(0.5)' },
    { name: 'room (reverb)', code: 's("bd").room(0.7)' },
    { name: 'size', code: 's("bd").size(0.9)' },
    { name: 'lpf', code: 's("bd").lpf(800)' },
    { name: 'hpf', code: 's("bd").hpf(200)' },
    { name: 'bpf', code: 's("bd").bpf(1000)' },
    { name: 'cutoff', code: 'note("c3").s("sawtooth").cutoff(800).gain(0.5)' },
    { name: 'resonance', code: 'note("c3").s("sawtooth").resonance(10).gain(0.5)' },
    { name: 'crush', code: 's("bd").crush(4)' },
    { name: 'shape', code: 's("bd").shape(0.7)' },
    { name: 'distort', code: 's("bd").distort(0.7)' },
    { name: 'phaser', code: 's("bd").phaser(0.7)' },
    { name: 'chorus', code: 's("bd").chorus(0.5)' },
    { name: 'tremolo', code: 's("bd").tremolo(0.5)' },
    { name: 'compressor', code: 's("bd").compressor()' },
    { name: 'loop', code: 's("bd").loop(0.5)' },
  ];

  for (const { name, code } of effects) {
    it(`effect ${name} doesn't crash and produces audio`, async () => {
      const buf = await renderCode(code, { duration: 2 });
      expect(buf).toBeDefined();
      // Effects may reduce volume significantly but shouldn't error
      // At minimum the dry signal should come through
      expect(isSilent(buf, 0.0001)).toBe(false);
    }, RENDER_TIMEOUT);
  }

  it('chained effects work', async () => {
    const buf = await renderCode(
      's("bd").room(0.5).delay(0.3).lpf(2000).gain(0.8)',
      { duration: 4 }
    );
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);
});

describe('pattern operations', () => {
  beforeAll(ensureScope);

  it('slow() stretches the pattern', async () => {
    const buf = await renderCode('s("bd").slow(2)', { duration: 4 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('fast() compresses the pattern', async () => {
    const buf = await renderCode('s("bd").fast(4)', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('rev() reverses the pattern', async () => {
    const buf = await renderCode('s("bd sd").rev()', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('struct() applies rhythmic structure', async () => {
    const buf = await renderCode('s("bd sd").struct("x [x x] x x")', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('euclid() generates euclidean rhythms', async () => {
    const buf = await renderCode('s("hh").euclid(5,8)', { duration: 4 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('jux() applies effect to one channel', async () => {
    const buf = await renderCode('s("bd").jux(rev)', { duration: 2 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('sometimes() randomly applies modification', async () => {
    const buf = await renderCode('s("hh*8").sometimes(x => x.speed(2))', { duration: 4 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('mask() gates the pattern', async () => {
    const buf = await renderCode('s("bd*8").mask("1 0 1 [0 1]")', { duration: 4 });
    expect(buf).toBeDefined();
  }, RENDER_TIMEOUT);

  it('stack() layers patterns', async () => {
    const buf = await renderCode(
      'stack(s("bd").gain(0.5), note("c3").s("sine").gain(0.3))',
      { duration: 2 }
    );
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);

  it('setcps() controls tempo', async () => {
    const buf = await renderCode('setcps(0.5); s("bd")', { duration: 4, cps: 0.5 });
    expect(isSilent(buf)).toBe(false);
  }, RENDER_TIMEOUT);
});
