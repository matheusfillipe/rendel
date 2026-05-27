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
- 🧪 **110 tests** — unit, integration, regression, effects validation

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

## API
