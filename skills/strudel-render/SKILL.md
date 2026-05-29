---
name: strudel-render
description: Use the rendel HTTP API to render Strudel pattern code to audio, browse and search real example tunes, and build strudel.cc share links. Use when an agent needs to turn Strudel/live-coding music code into an audio file or a shareable link, or to look up working example patterns.
---

# Rendel API

Rendel renders [Strudel](https://strudel.cc) pattern code to audio, statelessly. It
also serves a searchable library of real, human-made example tunes and builds
strudel.cc share links. Nothing is stored server-side.

The base URL is deployment-specific — read it from `RENDEL_API_BASE` (e.g.
`http://localhost:8080`). All examples below use `$RENDEL_API_BASE`.

## Endpoints

### `POST /render` → audio file
Render pattern code to audio. Body is either `text/plain` (the raw code) or JSON
`{"code": "..."}`. Options via query string or JSON fields:

| option | default | notes |
|---|---|---|
| `format` | `wav` | `wav`, `mp3`, `flac`, `ogg` (non-wav needs ffmpeg, present in the image) |
| `duration` | `30` | seconds; clamped to a server maximum (default 180) |
| `samplerate` | `44100` | 22050 / 44100 / 48000 / 88200 / 96000 |
| `quality` | — | MP3 VBR 0–9, OGG 1–10, FLAC 0–8 |
| `exact` | `false` | `true` renders the literal `duration`; default auto-fits to the pattern's loop |
| `upload` | `false` | `true` stores the render and returns JSON `{ url, format, bytes }` (a public URL) instead of the audio bytes — use this when you want a link, not a download |

With `upload=true` the response is `application/json` — e.g.
`{"url":"https://s3-api.t3ks.com/rendel/renders/<id>.mp3","format":"mp3","bytes":197080}` —
and the URL is publicly readable (no auth). Returns `503` if object storage
isn't configured on the server. Without it, the response is the raw audio:

Returns the audio bytes with the matching `Content-Type`. Strudel patterns loop
forever, so by default rendel **auto-fits**: it detects the pattern's loop length
and renders exactly one pass, ending on the pattern's own resolution instead of
restarting a finished piece mid-file — so the output may be shorter than
`duration`. Short loops meant to repeat, and patterns with no detectable loop
(true randomness), fall back to the literal `duration`. Pass `exact=true` to
always render the requested `duration`. Rendering is also bounded by a wall-clock
timeout; a busy server may return `429`.

```bash
curl -sX POST "$RENDEL_API_BASE/render?format=mp3&duration=8" \
  -H 'content-type: text/plain' \
  --data 's("bd*4, hh*8").bank("RolandTR909")' -o out.mp3
```

### `GET /examples` → list / search
Fuzzy-search the example library by title, author, id, tags, or code.

| query | default |
|---|---|
| `q` (alias `search`) | — (empty = list all) |
| `page` | 1 |
| `limit` | 20 (max 100) |

Each result has `id`, `title`, `author`, `tags`, `lines`, `chars`, and a `snippet`.
Use the `id` with the next endpoint to fetch full code.

```bash
curl -s "$RENDEL_API_BASE/examples?q=bass&limit=5"
```

### `GET /examples/:id` → full code
Returns the complete `code` plus metadata for one example.

### `POST /share` → strudel.cc URL
Same body shape as `/render`. Returns `{"url": "https://strudel.cc/#<base64>"}` —
open it to play/edit the pattern in the browser REPL.

```bash
curl -sX POST "$RENDEL_API_BASE/share" -H 'content-type: text/plain' \
  --data 'note("c e g").s("piano")'
```

## Typical agent workflow

1. `GET /examples?q=<style>` to find a relevant tune, then `GET /examples/:id` for code.
2. Adapt the code, or write new code (see below).
3. `POST /render` to get audio, and/or `POST /share` to get a playable link.

## Writing Strudel code that renders cleanly

- **Use double quotes for mini-notation.** `s("bd*4")` is parsed as a pattern;
  `s('bd*4')` is treated as a literal sound name and will not work.
- **Layer with `stack(...)` or commas**, e.g. `stack(s("bd*4"), s("hh*8"))`.
- **Structure longer pieces with `arrange([cycles, pattern], ...)`** — each section
  plays for the given number of cycles, in order.
- **Sounds:** drum samples (`bd sd hh cp ...`), GM soundfonts (`piano`, `rhodes`,
  `strings`, `sax`, ...), and synths (`sine`, `sawtooth`, `square`, `triangle`,
  `supersaw`). `note(...)` / `n(...).scale(...)` for pitch; `chord("<Cm7 ...>/4").voicing()` for harmony.
- **Effects:** `gain pan lpf hpf room delay crush shape distort` etc.
- **Endings:** patterns loop; for a clean ending strike a final chord with a long
  envelope/reverb and let it decay — or just request a fixed `duration`.
- **Avoid `arp()`** in headless rendering (unstable); write arpeggios out as note
  sequences instead. `chorus()` is a no-op.

## Notes

- The API is stateless and stores nothing; the share link encodes the code itself.
- The example library is fetched live from the upstream Strudel repository, so it
  reflects the current set of community tunes.
