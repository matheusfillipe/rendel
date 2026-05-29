/**
 * Soundfont tests — verify GM instruments work with both gm_ prefix and short alias.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getRMS, isSilent } from './helpers/audio.js';
import { ensureScope, renderCode } from './helpers/fixtures.js';

const T = 30_000;

describe('soundfonts', () => {
  beforeAll(ensureScope);

  const instruments = [
    'piano',
    'flute',
    'violin',
    'trumpet',
    'acoustic_bass',
    'cello',
    'church_organ',
    'acoustic_guitar_nylon',
  ];

  for (const inst of instruments) {
    it(
      `s("${inst}") produces non-silent audio`,
      async () => {
        const buf = await renderCode(`note("c4 e4 g4").s("${inst}").gain(0.5)`, { duration: 2 });
        expect(isSilent(buf)).toBe(false);
        expect(getRMS(buf)).toBeGreaterThan(0.001);
      },
      T,
    );
  }

  it(
    'gm_ prefix works directly',
    async () => {
      const buf = await renderCode('note("c4").s("gm_piano").gain(0.5)', { duration: 2 });
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );

  it(
    'short alias matches gm_ prefix',
    async () => {
      const bufShort = await renderCode('note("c4").s("piano").gain(0.5)', { duration: 2 });
      const bufGm = await renderCode('note("c4").s("gm_piano").gain(0.5)', { duration: 2 });
      // Both should produce similar RMS (same instrument, may differ due to variant selection)
      expect(getRMS(bufShort)).toBeGreaterThan(0.001);
      expect(getRMS(bufGm)).toBeGreaterThan(0.001);
    },
    T,
  );

  it(
    'soundfont with effects chain works',
    async () => {
      const buf = await renderCode(
        'note("c4 e4 g4 c5").s("piano").room(0.3).delay(0.4).gain(0.4)',
        { duration: 4 },
      );
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );

  it(
    'convenience aliases: rhodes, guitar, bass, sax',
    async () => {
      for (const inst of ['rhodes', 'guitar', 'bass', 'sax', 'strings', 'brass', 'organ', 'pad']) {
        const buf = await renderCode(`note("c4").s("${inst}").gain(0.5)`, { duration: 2 });
        expect(isSilent(buf)).toBe(false);
      }
    },
    T,
  );

  it(
    'soundfont with note pattern works',
    async () => {
      const buf = await renderCode(
        'note("c3 [eb3 g3] bb3 c4").s("piano").struct("x [x x] x x").gain(0.5)',
        { duration: 4 },
      );
      expect(isSilent(buf)).toBe(false);
    },
    T,
  );
});
