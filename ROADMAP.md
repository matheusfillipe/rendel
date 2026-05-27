# Rendel Enhancement Roadmap

**Created:** 2026-05-28  
**Updated:** 2026-05-28  
**Status:** ✅ **COMPLETE** — all phases implemented, tested, and pushed to `h4ksclaw/rendel`

## Final Status

| Phase | Status | Details |
|---|---|---|
| **5A: Local Samples** | ✅ Done | 218 Dirt-Sample packs, fetch monkey-patch, `strudel.json` index |
| **5B: Soundfonts** | ✅ Done | 125 GM instruments with `gm_` prefix + 17 convenience aliases |
| **5C: Test Suite** | ✅ Done | 107 tests (all pass) across 5 test files |
| **5D: Effects Validation** | ✅ Done | 18 effects validated with audible change tests, `docs/EFFECTS.md` |
| **5E: Polish** | ✅ Done | `--format`, `--quality`, `-q`, `patch-package`, README |
| **5E: Push** | ✅ Done | Pushed to `h4ksclaw/rendel` main branch |

## What's Included

### Sound Sources
- **218 Dirt-Sample packs** — `s("bd")`, `s("808")`, `s("bass")`, etc. (offline)
- **125 GM Soundfont instruments** — `s("piano")`, `s("rhodes")`, `s("violin")`, `s("sax")`, etc.
- **6 built-in synths** — sine, sawtooth, square, triangle, supersaw, noise

### Effects (20+)
- **Delay**: delay, delaytime, delayfeedback/delayfb/dfb
- **Reverb**: room/reverb, size, dry
- **Filters**: lpf, hpf, bpf, cutoff, resonance
- **Distortion**: crush, shape, distort
- **Modulation**: phaser, tremolo, chorus (stub — no DSP)
- **Dynamics**: gain, pan, compressor ✅ (fixed NaN bug)
- **Sample**: speed, begin, end, loop

### Pattern Operations
- slow, fast, rev, struct, euclid, jux, mask, every, sometimes, stack, superimpose, layer

### CLI Flags
- `-f, --file` — input .js pattern file
- `-o, --output` — output file (.wav, .mp3, .flac, .ogg)
- `-d, --duration` — render duration in seconds
- `-r, --samplerate` — sample rate (default 44100)
- `--cps` — cycles per second (tempo)
- `--format` — override output format
- `--quality` — encoding quality
- `-p, --progress` — per-chunk timing
- `-q` — quiet mode

### Test Coverage
- `test/renderer.test.js` (13 tests) — pattern eval, buffer output, chunking
- `test/audio.test.js` (47 tests) — synths, samples, effects, pattern ops
- `test/effects.test.js` (19 tests) — effect validation with audible changes
- `test/soundfonts.test.js` (14 tests) — GM instruments + aliases
- `test/regression.test.js` (14 tests) — example patterns + audio quality

**Total: 107 tests, 107 passing, 0 skipped, 0 failures**

## Known Limitations

| Feature | Issue |
|---|---|
| `chorus()` | Control stub only — no DSP in superdough. No-op. |
| `.noise()` / `.lpenv()` | Can cause superdough node disconnect errors |
| `.fit()` / `.chop()` | Crash in some chains (upstream superdough bug) |
| Soundfonts | No variant selection (picks first available) |
| MIDI/OSC output | Not supported (headless only) |
| Comma syntax | Use `stack()` — JS comma returns only last expression |
| No live mode | Offline rendering only |
