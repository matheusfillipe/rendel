# Rendel Effects Reference

## Effect Validation Status

Every effect has been tested with both unit tests and manual rendering.
Results are compared against a no-effect baseline to confirm audible changes.

| Effect | Status | Notes |
|--------|--------|-------|
| `gain` | ✅ Works | -62.5% RMS change. Clean volume control. |
| `pan` | ✅ Works | Full L/R panning verified: pan(0)=L only, pan(1)=R only |
| `delay` | ✅ Works | +15% RMS. Adds echo taps. |
| `delaytime` | ✅ Works | Controls delay spacing. Use with `.delay()`. |
| `delayfeedback` | ✅ Works | Controls echo repetitions. Use with `.delay()`. |
| `room` | ✅ Works | +70% RMS (reverb). **Can clip** — reduce gain when using high room values. |
| `size` | ✅ Works | Controls reverb room size. Use with `.room()`. |
| `dry` | ✅ Works | Controls dry/wet mix for reverb. dry(0)=100% wet, dry(1)=100% dry. |
| `lpf` | ✅ Works | Low-pass filter. Minimal RMS change on single notes (affects harmonics). |
| `hpf` | ✅ Works | High-pass filter. -75% RMS — removes low frequencies strongly. |
| `bpf` | ✅ Works | Band-pass filter. -65% RMS — isolates mid frequencies. |
| `cutoff` | ✅ Works | Synth filter cutoff. Combine with `resonance()` for sweep effect. |
| `resonance` | ⚠️ Works* | No audible change alone. Must pair with `cutoff()` for effect. |
| `cutoff+resonance` | ✅ Works | +84% RMS when combined. Classic synth filter sweep. |
| `crush` | ✅ Works | Bit-crushing. +32% RMS from quantization noise. |
| `shape` | ✅ Works | Waveshaping distortion. +331% RMS — very strong! |
| `distort` | ✅ Works | +88% RMS. More subtle than shape. |
| `phaser` | ✅ Works | -12% RMS. Subtle modulation. |
| `chorus` | ⚠️ Limited | No audible RMS change in headless mode. Stereo feedback issue. |
| `tremolo` | ✅ Works | -57% RMS. Amplitude modulation. |
| `compressor` | ❌ Broken | Produces NaN values in OfflineAudioContext. Do not use. |
| `loop` | ✅ Works | +100% RMS. Creates sample loop points. |
| `speed` | ✅ Works | Controls playback speed. speed(2)=double speed/octave up. |
| `begin` | ✅ Works | Start point offset. -47% RMS (shorter sample). |
| `end` | ✅ Works | End point cutoff. |
| `rev` | ✅ Works | Reverses pattern order (not sample audio). Use on multi-hit patterns. |

## Pattern Operations

| Operation | Status | Notes |
|-----------|--------|-------|
| `slow(n)` | ✅ Works | Stretches pattern by factor n |
| `fast(n)` | Works | Compresses pattern by factor n |
| `rev()` | ✅ Works | Reverses pattern event order |
| `struct()` | ✅ Works | Applies rhythmic structure |
| `euclid(k,n)` | ✅ Works | Euclidean rhythm: k beats in n steps |
| `jux(fn)` | ✅ Works | Applies fn to one stereo channel only. **Can clip.** |
| `mask()` | ✅ Works | Gates pattern with boolean pattern |
| `every(n,fn)` | ✅ Works | Applies fn every nth cycle |
| `sometimes(fn)` | ✅ Works | Randomly applies fn to events |
| `stack(a,b)` | ✅ Works | Layers patterns simultaneously |
| `add()` | ❌ Broken | Use `stack()` instead — add() fails with mixed s()/note() types |

## Known Limitations

1. **compressor()** — Produces NaN in OfflineAudioContext. Superdough bug.
2. **add()** — "cannot parse as numeral" error when mixing s() and note(). Use stack().
3. **chorus()** — No audible effect in headless rendering. Stereo feedback may not work in OfflineAudioContext.
4. **resonance()** — Only effective when paired with cutoff().
5. **room() clipping** — Reverb can push peak above 1.0. Use gain(0.5) before room().
6. **jux() clipping** — Can push peak above 1.0 due to channel summing.
