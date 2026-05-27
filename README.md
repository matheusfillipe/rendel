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
- 🧪 **106 tests** — unit, integration, regression, effects validation

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

# Force format regardless of extension
npx rendre...[truncated]