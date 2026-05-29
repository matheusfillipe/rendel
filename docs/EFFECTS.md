# Rendel Effects Reference

Effects and pattern operations that work with the offline renderer. Anything
not listed may still work if superdough supports it — these are the ones with
test coverage. Caveats are noted where behaviour is surprising.

## Effects

| Effect | Notes |
|--------|-------|
| `gain` | Volume. |
| `pan` | `pan(0)` = left only, `pan(1)` = right only. |
| `delay` | Echo. Pair with `delaytime` and `delayfeedback`. |
| `delaytime` | Delay spacing. |
| `delayfeedback` / `delayfb` / `dfb` | Echo repetitions. |
| `room` / `reverb` | Reverb. Can clip — lower `gain()` first. |
| `size` | Reverb room size. Use with `room()`. |
| `dry` | Dry/wet mix. `dry(0)` = fully wet, `dry(1)` = fully dry. |
| `lpf` / `hpf` / `bpf` | Low / high / band-pass filters. |
| `cutoff` | Synth filter cutoff. Combine with `resonance` for a sweep. |
| `resonance` | Only audible when paired with `cutoff`. |
| `crush` | Bit-crushing. |
| `shape` | Waveshaping distortion (aggressive). |
| `distort` | Distortion (subtler than `shape`). |
| `phaser` | Subtle modulation. |
| `chorus` | Stub only — no DSP in superdough, so it's a no-op. |
| `tremolo` | Amplitude modulation. |
| `compressor` | Works with or without args. |
| `speed` | Playback speed. `speed(2)` = octave up. |
| `begin` / `end` | Sample start/end points. |
| `loop` | Sample loop points. |

## Pattern Operations

`slow`, `fast`, `rev`, `struct`, `euclid`, `jux`, `mask`, `every`, `sometimes`,
`stack`, `superimpose`, `layer`.

- `,` (comma) is auto-wrapped in `stack()` — `a, b` layers `a` and `b`.
- `add(n)` is arithmetic (adds `n` to numeric patterns), **not** layering.
- `jux()` can push peaks past 1.0 due to channel summing.
