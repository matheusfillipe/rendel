# Rendel Enhancement Roadmap — Samples, Effects, Tests, Completeness

**Created:** 2026-05-28  
**Status:** Draft — awaiting approval

## Current State (What Works ✅)

| Category | Status |
|---|---|
| Core rendering pipeline | ✅ OfflineAudioContext chunking works |
| CLI (`-f`, `-o`, `-d`, `-p`) | ✅ WAV + MP3 export |
| Synths (sine, saw, tri, square) | ✅ All produce audio |
| Supersaw oscillator | ✅ Works |
| Effects: delay, room, lpf, hpf, bpf, cutoff, resonance | ✅ Work |
| Effects: gain, pan, compressor, crush, shape, distort | ✅ Work |
| Effects: phaser, chorus, tremolo | ✅ Work |
| Effects: loop, begin, end, speed, rev, struct, euclid | ✅ Work |
| Pattern ops: slow, fast, jux, mask, sometimes, every | ✅ Work |
| Soundfonts (piano, rhodes, gm_piano) | ❌ Silent — needs network fetch |
| Sample-based sounds (bd, sd, hh, etc.) | ❌ "sound not found" — no local samples |
| Effects: reverb (separate from room), wet, spectral, flanger, widen | ❌ Not available in current scope |
| Tests | ❌ Zero test coverage |
| CI / npm publish | ❌ Not done |

## Gap Analysis

### 1. Samples (Critical — most Strudel patterns use them)
- Strudel/superdough loads samples from `https://shabda.ndre.gr` or GitHub raw URLs
- Dirt-Samples has **218 sample packs** (~175MB): bd, sd, hh, 808, 909, bass, drum, etc.
- Without samples, patterns like `s("bd sd hh")` produce silence
- **Fix**: Clone Dirt-Samples locally, register local sample prefix

### 2. Soundfonts (Important — melodic instruments)
- `@strudel/soundfonts` fetches from `https://felixroos.github.io/webaudiofontdata/`
- In offline Node.js, the fetch fails silently
- **Fix**: Pre-download soundfont files or cache them after first fetch

### 3. Missing Effects
- `reverb` — exists as `room` (which is the reverb wrapper), `reverb` is not a separate method
- `wet` — not exposed (use `dry(0)` as workaround for 100% wet)
- `flanger`, `widen`, `spectral` — not available in current strudel packages
- These are minor — `room`/`delay`/`phaser`/`chorus` cover 95% of use cases

### 4. AudioWorklet Effects
- 15 worklet processors registered (ladder filter, crush, distort, shape, supersaw, phase-vocoder, etc.)
- All work in OfflineAudioContext — confirmed working
- `pulse` oscillator has known issue in worklet (registered but may not produce output)

### 5. Test Coverage
- Zero tests currently
- Need: unit tests for renderer, integration tests for audio output, regression tests

---

## Plan: Phase 5+ (Our Extensions)

### Phase 5A: Local Samples Support
**Goal**: Make all 218 Dirt-Samples packs available offline

1. Clone Dirt-Samples to `/var/lib/hermes/rendel/samples/`
2. Write `src/samples.js` — registers local sample prefix with superdough
3. Patch renderer to auto-register samples on setup
4. Test: render `s("bd sd hh")` and verify non-silent output
5. Test: render `s("808:1")` and verify numbered variant works
6. Test: render `s("bass")` with `speed()` and `begin()/end()` slicing

### Phase 5B: Soundfont Cache
**Goal**: Piano, rhodes, GM instruments work offline

1. Pre-fetch commonly used soundfonts to `soundfonts/` dir
2. Patch `registerSoundfonts()` to load from local cache when offline
3. Test: render `note("c3").s("piano")` — verify audio output
4. Test: render `note("[c3 e3 g3]").s("rhodes")` — verify polyphony

### Phase 5C: Test Suite
**Goal**: Prevent regressions, validate every feature

1. Set up `vitest` (already in PLAN.md tech stack)
2. **Unit tests** (`test/renderer.test.js`):
   - `evaluatePattern()` returns a Pattern for valid code
   - `evaluatePattern()` throws for invalid code
   - `renderToBuffer()` returns correct length buffer
   - Chunking produces correct output duration
3. **Integration tests** (`test/audio.test.js`):
   - Each synth (sine, saw, tri, square) produces non-silent audio
   - Each effect (delay, room, lpf, etc.) modifies the audio signal
   - Sample playback produces non-silent audio
   - Soundfont playback produces non-silent audio
4. **Regression tests** (`test/regression.test.js`):
   - Existing example patterns all render without error
   - Output RMS is within expected range (not silence, not clipping)
5. **Audio quality helpers** (`test/helpers/audio.js`):
   - `getRMS(buffer)` — root mean square
   - `getPeak(buffer)` — peak amplitude
   - `isSilent(buffer, threshold)` — boolean check
   - `fftDiff(bufferA, bufferB)` — spectral comparison

### Phase 5D: Effects Validation & Enhancement
**Goal**: Verify all effects produce audible changes, document limitations

1. For each working effect, render with effect=0 and effect=max
2. Compare outputs — verify effect actually changes the audio
3. Document which effects are available with examples
4. Investigate missing effects (flanger, widen) — can they be polyfilled?
5. Test effect chains (room + delay + lpf + gain)

### Phase 5E: Polish & Publish
**Goal**: Production-quality tool

1. Convert `@kabelsalat/web` ESM fix to proper `patch-package` format
2. Add `--format` flag (wav, mp3, ogg, flac)
3. Add `--quality` flag for MP3 bitrate
4. Progress bar with ETA for long renders
5. Watch mode (`--watch`)
6. Publish to npm as `rendel`
7. GitHub Actions CI

---

## Implementation Order (Priority)

| Step | Phase | Effort | Impact |
|---|---|---|---|
| 1 | 5A: Local samples | 2h | 🔴 Critical — without this, most patterns are silent |
| 2 | 5C: Test suite | 2h | 🔴 Critical — prevents regressions, validates features |
| 3 | 5D: Effects validation | 1h | 🟡 Important — confirms what actually works |
| 4 | 5B: Soundfont cache | 1.5h | 🟡 Important — melodic instruments |
| 5 | 5E: Patch-package fix | 0.5h | 🟢 Nice — prevents npm install breakage |
| 6 | 5E: Progress bar | 0.5h | 🟢 Nice — UX improvement |
| 7 | 5E: Watch mode | 1h | 🟢 Nice — dev workflow |
| 8 | 5E: npm publish + CI | 1h | 🟢 Nice — distribution |

**Total estimated: ~9.5 hours**

---

## Validation Strategy

After each step, run this checklist:

```
□ All example patterns render without error
□ Output is non-silent (RMS > 0.001)
□ Output doesn't clip (peak < 1.0)  
□ Output duration matches requested duration (±100ms)
□ Sum of all tracks equals reasonable mixdown
□ Previously working features still work (no regression)
□ Test suite passes (green)
```

## Self-Validation: Sum of Tracks

For multi-layer patterns, render each layer separately and together:
```js
// Layer 1: drums
s("bd [sd bd] hh*4").gain(0.7)
// Layer 2: bass  
note("c2 [c2 eb2]").s("sawtooth").cutoff(400).gain(0.5)
// Together: both layers
s("bd [sd bd] hh*4").gain(0.7)
  .add(note("c2 [c2 eb2]").s("sawtooth").cutoff(400).gain(0.5))
```
Compare RMS of individual layers vs combined — should be additive.
