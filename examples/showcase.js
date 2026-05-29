// "showcase" — a slow neo-classical / ambient piece in C minor.
// Lush string + rhodes harmony over a soft upright bass, a sparse piano
// arpeggio and bell glints. No drum kit — just a whisper of brushed hat in
// the fuller sections. Builds gently and resolves to a held, fading chord.
//
// Structure (arrange, in cycles @ 0.5 cps = 2s each):
//   intro 8 · verse 16 · build 16 · climax 12 · outro 8 · resolution 4  =  128s
//
// (mini-notation needs DOUBLE quotes to be parsed as patterns.)
setcps(0.5)

const harmony = chord("<C-9 Ab^7 Eb^7 Bb7>/4").dict("ireal")

// swelling string pad — the harmonic bed under everything
const pad = harmony
  .voicing()
  .s("gm_string_ensemble_1")
  .attack(1)
  .release(2)
  .room(0.9)
  .gain(perlin.range(0.22, 0.36))

// warm synth pad doubling, only in the fuller sections
const warm = harmony
  .voicing()
  .s("gm_pad_warm")
  .attack(1.5)
  .room(0.8)
  .lpf(sine.range(600, 2200).slow(16))
  .gain(0.18)

// soft upright bass on the chord roots (C Ab Eb Bb), once per bar with a tail
const bass = note("<c2 ab1 eb2 bb1>/4")
  .s("gm_acoustic_bass")
  .struct("x ~ ~ ~")
  .release(0.7)
  .lpf(1200)
  .gain(0.5)

// gentle piano arpeggio drawn from the chord tones, dotted delay
const piano = harmony
  .n("0 2 4 3 2 4 5 4")
  .anchor("C5")
  .voicing()
  .s("gm_piano")
  .struct("x ~ x ~ x ~ x ~")
  .room(0.5)
  .delay(0.25)
  .delaytime(0.5)
  .delayfeedback(0.3)
  .gain(perlin.range(0.26, 0.38))

// rhodes melodic line, chord tones up high, breathy with reverb + delay
const lead = harmony
  .n("<0 2 4 <3 5>>")
  .anchor("C6")
  .voicing()
  .s("gm_epiano1")
  .segment(2)
  .room(0.6)
  .delay(0.3)
  .delaytime(0.375)
  .delayfeedback(0.35)
  .lpf(sine.range(1500, 3500).slow(12))
  .gain(0.3)

// sparse high bell glints
const glints = note("<c6 eb6 g6 bb6 g6 eb6>")
  .s("triangle")
  .struct("~ ~ x ~ ~ ~ ~ x")
  .decay(0.7)
  .sustain(0)
  .room(0.9)
  .delay(0.6)
  .delaytime(0.75)
  .delayfeedback(0.4)
  .gain(0.18)

// whisper-quiet brushed hat — no kick, no snare
const hat = s("hh*4")
  .gain(perlin.range(0.05, 0.12))
  .hpf(8000)
  .pan(sine.range(-0.3, 0.3))
  .room(0.3)

// gentle downtempo groove — soft sine kick, brushed snare on the backbeat,
// light swung hats. Tasteful, never the focus.
const groove = stack(
  note("c1").s("sine").struct("x ~ ~ ~ ~ ~ x ~").attack(0.005).decay(0.28).sustain(0).gain(0.5),
  s("sd").struct("~ ~ x ~").hpf(350).room(0.3).gain(0.26),
  s("hh*8").gain(perlin.range(0.05, 0.12)).hpf(8000).pan(sine.range(-0.3, 0.3)).room(0.3),
)

// final chord: struck once, decays to silence via its envelope + reverb tail.
// slow(8) holds it across the whole 4-cycle resolution so it never retriggers.
const resolveChord = note("c3,eb3,g3,bb3,d4")
  .s("gm_string_ensemble_1")
  .struct("x")
  .slow(8)
  .attack(1)
  .decay(5.5)
  .sustain(0)
  .release(4)
  .room(0.95)
  .gain(0.55)

const resolveBass = note("c2")
  .s("gm_acoustic_bass")
  .struct("x")
  .slow(8)
  .attack(0.02)
  .decay(3.5)
  .sustain(0)
  .room(0.4)
  .gain(0.5)

arrange(
  [8, stack(pad, glints)],
  [16, stack(pad, bass, piano)],
  [16, stack(pad, bass, piano, lead, hat)],
  [12, stack(pad, warm, bass, piano, lead, glints, groove)],
  [8, stack(pad, bass, piano, glints).mul(gain(saw.range(1, 0.5).slow(8)))],
  [4, stack(resolveChord, resolveBass)],
)
