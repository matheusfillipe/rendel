import './polyfill.js';
import { fileURLToPath } from 'node:url';
import * as strudelCore from '@strudel/core';
import { evalScope } from '@strudel/core/evaluate.mjs';
import * as strudelMini from '@strudel/mini';
import { registerSoundfonts } from '@strudel/soundfonts';
import * as strudelTonal from '@strudel/tonal';
import { evaluate, transpiler } from '@strudel/transpiler';
import * as strudelWebaudio from '@strudel/webaudio';
import { parse as acornParse } from 'acorn';
import {
  errorLogger,
  initAudio,
  registerSynthSounds,
  setAudioContext,
  setSuperdoughAudioController,
  soundAlias,
  superdough,
} from 'superdough';
// superdough's main export comes from dist/index.mjs (a bundle that has its own copy
// of audioContext.mjs). superdoughoutput.mjs and helpers.mjs import from the UNBUNDLED
// audioContext.mjs directly — a separate module instance with its own `audioContext`
// variable. We must set the context on both so helpers.mjs doesn't fall back to
// creating a default AudioContext (sampleRate 48000) which then causes cross-context
// errors when connecting nodes.
import { setAudioContext as setAudioContextUnbundled } from 'superdough/audioContext.mjs';
import { SuperdoughAudioController } from 'superdough/superdoughoutput.mjs';
import { setupLocalSamples } from './samples.js';

// --- WeakRef tracking ---
// superdough's node pool (`st`), voice tracking (`Ne`), and other internals
// retain WeakRefs to nodes from previous contexts. Between chunks, those stale
// refs would cause "nodes from different contexts" errors when reused. We
// intercept WeakRef construction and, between chunks, neuter each tracked ref
// so deref() returns undefined and superdough treats its pool as empty.
const trackedRefs = new Set();
const NativeWeakRef = globalThis.WeakRef;
class TrackingWeakRef extends NativeWeakRef {
  constructor(target) {
    super(target);
    trackedRefs.add(this);
  }
}
globalThis.WeakRef = TrackingWeakRef;

// Returns true for objects that belong to a completed audio context and must
// not be handed to the next chunk. This deliberately excludes internals from
// Node.js (undici HTTP parsers, etc.) which also use WeakRef.
function isAudioRelated(target) {
  if (!target || typeof target !== 'object') return false;
  // AudioNode subclasses (AudioWorkletNode, GainNode, OscillatorNode, …) all
  // expose a `context` property.
  if ('context' in target) return true;
  // superdough voice-tracking entries are plain objects { node, stop, nodes }.
  if ('node' in target && 'stop' in target) return true;
  return false;
}

function invalidateAllRefs() {
  for (const ref of trackedRefs) {
    // Use the native deref so we don't hit our own patched version.
    const target = NativeWeakRef.prototype.deref.call(ref);
    if (isAudioRelated(target)) {
      ref.deref = () => undefined;
    }
  }
  trackedRefs.clear();
}

/** Set up Strudel's global scope (note, s, slow, fast, etc.) and register built-in synths. */
export async function setupScope() {
  // Register local Dirt-Samples (patch fetch + register packs with superdough)
  await setupLocalSamples();

  // Expose setcps as a scope function — wraps core's setCpsFunc
  const { setCpsFunc } = strudelCore;
  const extras = {
    setcps: (cps) => setCpsFunc(() => cps),
  };

  await evalScope(
    Promise.resolve(strudelCore),
    Promise.resolve(strudelMini),
    Promise.resolve(strudelWebaudio),
    Promise.resolve(strudelTonal),
    Promise.resolve(extras),
  );
  registerSynthSounds();
  registerSoundfonts();

  // --- Control aliases (added to Pattern.prototype by evalScope) ---
  // reverb() is an alias for room() — strudel.cc compat
  if (strudelCore.Pattern?.prototype?.room) {
    strudelCore.Pattern.prototype.reverb = strudelCore.Pattern.prototype.room;
  }
  // Alias control synonyms from @strudel/core/controls.mjs
  // These are defined with @synonyms JSDoc but some need explicit registration
  const { Pattern } = strudelCore;
  if (Pattern?.prototype) {
    // delayfeedback aliases
    if (Pattern.prototype.delayfeedback) {
      Pattern.prototype.delayfb = Pattern.prototype.delayfeedback;
      Pattern.prototype.dfb = Pattern.prototype.delayfeedback;
    }
    // delaytime alias
    if (Pattern.prototype.delaytime) {
      Pattern.prototype.dtime = Pattern.prototype.delaytime;
    }
  }

  // Alias every GM soundfont so s("piano") resolves to s("gm_piano").
  for (const name of GM_INSTRUMENTS) {
    soundAlias(`gm_${name}`, name);
  }
  // Common nicknames pointing at a specific GM instrument.
  for (const [alias, real] of Object.entries(GM_NICKNAMES)) {
    soundAlias(real, alias);
  }
}

const GM_INSTRUMENTS = [
  'piano',
  'epiano1',
  'epiano2',
  'harpsichord',
  'clavinet',
  'celesta',
  'glockenspiel',
  'music_box',
  'vibraphone',
  'marimba',
  'xylophone',
  'tubular_bells',
  'dulcimer',
  'drawbar_organ',
  'percussive_organ',
  'rock_organ',
  'church_organ',
  'reed_organ',
  'accordion',
  'harmonica',
  'bandoneon',
  'acoustic_guitar_nylon',
  'acoustic_guitar_steel',
  'electric_guitar_jazz',
  'electric_guitar_clean',
  'electric_guitar_muted',
  'overdriven_guitar',
  'distortion_guitar',
  'guitar_harmonics',
  'acoustic_bass',
  'electric_bass_finger',
  'electric_bass_pick',
  'fretless_bass',
  'slap_bass_1',
  'slap_bass_2',
  'synth_bass_1',
  'synth_bass_2',
  'violin',
  'viola',
  'cello',
  'contrabass',
  'tremolo_strings',
  'pizzicato_strings',
  'orchestral_harp',
  'timpani',
  'string_ensemble_1',
  'string_ensemble_2',
  'synth_strings_1',
  'synth_strings_2',
  'choir_aahs',
  'voice_oohs',
  'synth_choir',
  'orchestra_hit',
  'trumpet',
  'trombone',
  'tuba',
  'muted_trumpet',
  'french_horn',
  'brass_section',
  'synth_brass_1',
  'synth_brass_2',
  'soprano_sax',
  'alto_sax',
  'tenor_sax',
  'baritone_sax',
  'oboe',
  'english_horn',
  'bassoon',
  'clarinet',
  'piccolo',
  'flute',
  'recorder',
  'pan_flute',
  'blown_bottle',
  'shakuhachi',
  'whistle',
  'ocarina',
  'lead_1_square',
  'lead_2_sawtooth',
  'lead_3_calliope',
  'lead_4_chiff',
  'lead_5_charang',
  'lead_6_voice',
  'lead_7_fifths',
  'lead_8_bass_lead',
  'pad_new_age',
  'pad_warm',
  'pad_poly',
  'pad_choir',
  'pad_bowed',
  'pad_metallic',
  'pad_halo',
  'pad_sweep',
  'fx_rain',
  'fx_soundtrack',
  'fx_crystal',
  'fx_atmosphere',
  'fx_brightness',
  'fx_goblins',
  'fx_echoes',
  'fx_sci_fi',
  'sitar',
  'banjo',
  'shamisen',
  'koto',
  'kalimba',
  'bagpipe',
  'fiddle',
  'shanai',
  'tinkle_bell',
  'agogo',
  'steel_drums',
  'woodblock',
  'taiko_drum',
  'melodic_tom',
  'synth_drum',
  'reverse_cymbal',
  'guitar_fret_noise',
  'breath_noise',
  'seashore',
  'bird_tweet',
  'telephone',
  'helicopter',
  'applause',
  'gunshot',
];

const GM_NICKNAMES = {
  rhodes: 'gm_epiano1',
  epiano: 'gm_epiano2',
  guitar: 'gm_acoustic_guitar_nylon',
  bass: 'gm_acoustic_bass',
  strings: 'gm_string_ensemble_1',
  brass: 'gm_brass_section',
  choir: 'gm_synth_choir',
  harp: 'gm_orchestral_harp',
  bell: 'gm_tubular_bells',
  sax: 'gm_soprano_sax',
  synthbass: 'gm_synth_bass_1',
  pad: 'gm_pad_new_age',
  lead: 'gm_lead_1_square',
  organ: 'gm_church_organ',
  synthdrum: 'gm_synth_drum',
};

/**
 * Transform comma-separated top-level expressions into stack() calls.
 * This is part of the standard transpilation pipeline — `a, b, c` in JS
 * is a SequenceExpression that returns only the last value, but for
 * Strudel patterns the intent is layering. Same category as the mini-notation
 * string→m() transform that the upstream transpiler does.
 */
function transformCommas(code) {
  try {
    const ast = acornParse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true });
    // Case 1: Single top-level SequenceExpression
    if (
      ast.body.length === 1 &&
      ast.body[0].type === 'ExpressionStatement' &&
      ast.body[0].expression.type === 'SequenceExpression'
    ) {
      const exprs = ast.body[0].expression.expressions;
      const parts = exprs.map((e) => code.slice(e.start, e.end));
      return `stack(${parts.join(', ')})`;
    }
    // Case 2: Last of multiple statements is a SequenceExpression
    // e.g. setcps(0.5)\ns("bd"), s("hh")
    const lastStmt = ast.body[ast.body.length - 1];
    if (
      ast.body.length > 1 &&
      lastStmt.type === 'ExpressionStatement' &&
      lastStmt.expression.type === 'SequenceExpression'
    ) {
      const exprs = lastStmt.expression.expressions;
      const parts = exprs.map((e) => code.slice(e.start, e.end));
      const before = code.slice(0, lastStmt.start);
      return `${before}stack(${parts.join(', ')})`;
    }
  } catch {
    // If parsing fails, return original — let eval handle the error
  }
  return code;
}

export async function evaluatePattern(code) {
  code = transformCommas(code);
  const { pattern } = await evaluate(code, transpiler);
  if (!pattern || typeof pattern.queryArc !== 'function') {
    throw new Error(
      'Code did not return a Strudel Pattern. Make sure your file exports a pattern expression.',
    );
  }
  return pattern;
}

/** Return the CPS set by the pattern via setcps(), or null if not set. */
export function getPatternCps() {
  return strudelCore.getCps?.() ?? null;
}

async function renderChunk({ haps, beginCyc, cps, renderDur, sampleRate, workletsPath }) {
  const frameCount = Math.ceil(renderDur * sampleRate);
  const ctx = new OfflineAudioContext(2, frameCount, sampleRate);
  setAudioContext(ctx);
  setAudioContextUnbundled(ctx);
  setSuperdoughAudioController(new SuperdoughAudioController(ctx));
  await ctx.audioWorklet.addModule(workletsPath);

  // Suppress superdough's noisy "AudioWorklets disabled" log during initAudio
  const _log = console.log;
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('AudioWorklets disabled')) return;
    _log(...args);
  };
  await initAudio({ maxPolyphony: 100000, disableWorklets: true });
  console.log = _log;

  const hap2value = (hap) => {
    hap.ensureObjectValue();
    return hap.value;
  };

  for (const hap of haps) {
    try {
      // Clamp onset to 0 — floating-point imprecision can produce values like
      // -2.8e-16 when a hap onset exactly coincides with beginCyc (common with
      // triplet/quintuplet rhythms), which superdough rejects as "in the past".
      const onsetSec = Math.max(0, (hap.whole.begin.valueOf() - beginCyc) / cps);
      await superdough(hap2value(hap), onsetSec, hap.duration.valueOf() / cps, cps, onsetSec);
    } catch (err) {
      errorLogger(err, 'rendel');
    }
  }

  return ctx.startRendering();
}

/**
 * Render a Pattern by chunking the timeline into short windows, each with its
 * own OfflineAudioContext running the real effect worklets. Chunk outputs are
 * summed into a single stereo buffer.
 *
 * The tail for each chunk is computed dynamically from the longest hap in that
 * chunk, so long-duration notes (e.g. slow pads) play their full length rather
 * than being cut off at a fixed tail window.
 */
export async function renderToBuffer(
  pattern,
  { duration = 60, cps = 1, sampleRate = 44100, verbose = false } = {},
) {
  const workletsPath = fileURLToPath(new URL('./superdough-worklets.js', import.meta.url));

  const chunkDur = 3;
  const minTail = 2; // minimum extra seconds beyond chunkDur for reverb/delay tails
  const totalFrames = Math.ceil(duration * sampleRate);
  const outL = new Float32Array(totalFrames);
  const outR = new Float32Array(totalFrames);

  const numChunks = Math.ceil(duration / chunkDur);

  for (let i = 0; i < numChunks; i++) {
    const tSec = i * chunkDur;
    const thisChunkDur = Math.min(chunkDur, duration - tSec);
    const beginCyc = tSec * cps;
    const endCyc = (tSec + thisChunkDur) * cps;

    // Query haps with onset in this chunk window.
    const haps = pattern
      .queryArc(beginCyc, endCyc, { _cps: cps })
      .filter((h) => h.hasOnset())
      .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());

    // Compute the tail needed to let the longest hap fully play out.
    // onsetInChunk + hapDuration gives how far into the chunk's timeline the
    // sound ends; subtract chunkDur to get the extra time needed.
    let latestEndSec = thisChunkDur + minTail;
    for (const hap of haps) {
      const onsetSec = (hap.whole.begin.valueOf() - beginCyc) / cps;
      const hapDurSec = hap.duration.valueOf() / cps;
      latestEndSec = Math.max(latestEndSec, onsetSec + hapDurSec + minTail);
    }
    // Cap at the output duration so we never render past the end of the file.
    const renderDur = Math.min(latestEndSec, duration - tSec);

    const t0 = Date.now();
    const buf = await renderChunk({
      haps,
      beginCyc,
      cps,
      renderDur,
      sampleRate,
      workletsPath,
    });

    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const offset = Math.round(tSec * sampleRate);
    const n = Math.min(L.length, totalFrames - offset);
    for (let j = 0; j < n; j++) {
      outL[offset + j] += L[j];
      outR[offset + j] += R[j];
    }

    setAudioContext(null);
    setAudioContextUnbundled(null);
    setSuperdoughAudioController(null);
    invalidateAllRefs();

    if (verbose) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `rendel: chunk ${i + 1}/${numChunks} ` +
          `(${tSec.toFixed(1)}–${(tSec + thisChunkDur).toFixed(1)}s, ` +
          `render=${renderDur.toFixed(1)}s) in ${elapsed}s`,
      );
    }
  }

  // Return an AudioBuffer-compatible plain object — export.js only uses
  // numberOfChannels, sampleRate, and getChannelData().
  return {
    numberOfChannels: 2,
    sampleRate,
    length: totalFrames,
    duration,
    getChannelData(ch) {
      return ch === 0 ? outL : outR;
    },
  };
}
