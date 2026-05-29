# Rendel

**Headless Strudel.cc renderer** — render Strudel pattern files to WAV/MP3/FLAC/OGG from the command line. No browser needed.

Fork of [wyote4094/rendel](https://github.com/wyote4094/rendel) with enhancements for full Strudel.cc compatibility.

## Features

- 🎵 **Full Strudel.cc pattern language** — `s()`, `note()`, mini-notation, `stack()`, `struct()`, `euclid()`, etc.
- 🥁 **218 Dirt-Sample packs** — `s("bd")`, `s("hh*4")`, `s("808")`, all offline
- 🎹 **125 GM Soundfont instruments** — `s("piano")`, `s("rhodes")`, `s("violin")`, `s("sax")`, etc.
- 🎛️ **6 built-in synths** — sine, sawtooth, square, triangle, supersaw, noise
- 🔊 **20+ effects** — gain, pan, delay, room/reverb, lpf, hpf, crush, distort, phaser, tremolo, etc.
- 📤 **Multi-format export** — WAV, MP3, FLAC, OGG (via ffmpeg for non-WAV)
- ⚡ **Chunked rendering** — 3s chunks with dynamic tails for reverb/delay
- ✨ **Auto comma→stack()** — comma-separated patterns auto-wrapped (no more stack-only requirement!)

## Install

```bash
git clone https://github.com/h4ksclaw/rendel.git
cd rendel
npm install        # auto-patches @kabelsalat/web ESM issue
bash scripts/setup-samples.sh   # clones Dirt-Samples (174MB)
```

### Requirements

- **Node.js** ≥ 20
- **ffmpeg** (optional, for MP3/FLAC/OGG export)

## Usage

```bash
# Basic: render a pattern to WAV
npx rendel -f pattern.js -o output.wav -d 30

# With effects and progress
npx rendel -f beat.js -o beat.mp3 -d 60 -p

# High quality MP3
npx rendel -f song.js -o song.mp3 --quality 0 -d 120
```

## Pattern Files

Pattern files are plain JavaScript that evaluate to a Strudel pattern:

```js
// Single layer
s("bd*4").gain(0.8).room(0.2)

// Multi-layer: commas work! (auto-wrapped in stack)
s("bd*4").gain(0.8), s("hh*4").gain(0.3), note("c3").s("sawtooth")

// Or use explicit stack() — both produce identical output
stack(
  s("bd*4").gain(0.8),
  s("hh*4").gain(0.3),
  note("c3").s("sawtooth").delay(0.3)
)
```

## Options

| Flag | Description |
|---|---|
| `-f, --file <path>` | Input `.js` pattern file (required) |
| `-o, --output <path>` | Output file: `.wav`, `.mp3`, `.flac`, `.ogg` (required) |
| `-d, --duration <s>` | Render duration in seconds (default 60) |
| `-r, --samplerate <hz>` | 22050, 44100, 48000, 88200, or 96000 (default 44100) |
| `--cps <n>` | Cycles per second / tempo (default 1, or the pattern's `setcps()`) |
| `--format <fmt>` | Override output format |
| `--quality <n>` | Encoder quality — MP3 VBR 0–9, OGG 1–10, FLAC compression 0–8 |
| `-p, --progress` | Print per-chunk render timing |
| `-q, --quiet` | Only print errors |

MP3/FLAC/OGG export requires `ffmpeg` on `PATH`; WAV is written directly.

## Limitations

- `chorus()` is a control stub — no DSP in superdough, so it's a no-op.
- `resonance()` is only audible when paired with `cutoff()`.
- `room()` and `jux()` can push peaks past 1.0 — lower `gain()` first.
- Soundfonts pick the first available variant (no variant selection).
- Offline rendering only — no live mode, MIDI, or OSC output.

## Development

```bash
npm install        # also installs the husky pre-commit hook
npm test           # vitest (watch); requires the Dirt-Samples clone
npm run lint       # biome — lint + format check (no writes)
npm run format     # biome — apply lint/format autofixes
```

[Biome](https://biomejs.dev) handles linting and formatting. A husky + lint-staged
pre-commit hook autofixes staged files, and GitHub Actions runs lint and tests on
every push and PR.
