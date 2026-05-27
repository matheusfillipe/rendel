import './polyfill.js';
import { fileURLToPath } from 'url';
import {
  superdough,
  setAudioContext,
  initAudio,
  setSuperdoughAudioController,
  registerSynthSounds,
  soundAlias,
  errorLogger,
} from 'superdough';
import { setupLocalSamples } from './samples.js';
// superdough's main export comes from dist/index.mjs (a bundle that has its own copy
// of audioContext.mjs). superdoughoutput.mjs and helpers.mjs import from the UNBUNDLED
// audioContext.mjs directly — a separate module instance with its own `audioContext`
// variable. We must set the context on both so helpers.mjs doesn't fall back to
// creating a default AudioContext (sampleRate 48000) which then causes cross-context
// errors when connecting nodes.
import { setAudioContext as setAudioContextUnbundled } from 'superdough/audioContext.mjs';
import { SuperdoughAudioController } from 'superdough/superdoughoutput.mjs';
import { evalScope } from '@strudel/core/evaluate.mjs';
import { transpiler, evaluate } from '@strudel/transpiler';
import * as strudelCore from '@strudel/core';
import * as strudelMini from '@strudel/mini';
import * as strudelWebaudio from '@strudel/webaudio';
import * as strudelTonal from '@strudel/tonal';
import { registerSoundfonts } from '@strudel/soundfonts';

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
  const sampleCount = await setupLocalSamples();

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

  // Alias GM soundfonts: s("piano") -> s("gm_piano")
  soundAlias('gm_piano', 'piano');
  soundAlias('gm_epiano1', 'epiano1');
  soundAlias('gm_epiano2', 'epiano2');
  soundAlias('gm_harpsichord', 'harpsichord');
  soundAlias('gm_clavinet', 'clavinet');
  soundAlias('gm_celesta', 'celesta');
  soundAlias('gm_glockenspiel', 'glockenspiel');
  soundAlias('gm_music_box', 'music_box');
  soundAlias('gm_vibraphone', 'vibraphone');
  soundAlias('gm_marimba', 'marimba');
  soundAlias('gm_xylophone', 'xylophone');
  soundAlias('gm_tubular_bells', 'tubular_bells');
  soundAlias('gm_dulcimer', 'dulcimer');
  soundAlias('gm_drawbar_organ', 'drawbar_organ');
  soundAlias('gm_percussive_organ', 'percussive_organ');
  soundAlias('gm_rock_organ', 'rock_organ');
  soundAlias('gm_church_organ', 'church_organ');
  soundAlias('gm_reed_organ', 'reed_organ');
  soundAlias('gm_accordion', 'accordion');
  soundAlias('gm_harmonica', 'harmonica');
  soundAlias('gm_bandoneon', 'bandoneon');
  soundAlias('gm_acoustic_guitar_nylon', 'acoustic_guitar_nylon');
  soundAlias('gm_acoustic_guitar_steel', 'acoustic_guitar_steel');
  soundAlias('gm_electric_guitar_jazz', 'electric_guitar_jazz');
  soundAlias('gm_electric_guitar_clean', 'electric_guitar_clean');
  soundAlias('gm_electric_guitar_muted', 'electric_guitar_muted');
  soundAlias('gm_overdriven_guitar', 'overdriven_guitar');
  soundAlias('gm_distortion_guitar', 'distortion_guitar');
  soundAlias('gm_guitar_harmonics', 'guitar_harmonics');
  soundAlias('gm_acoustic_bass', 'acoustic_bass');
  soundAlias('gm_electric_bass_finger', 'electric_bass_finger');
  soundAlias('gm_electric_bass_pick', 'electric_bass_pick');
  soundAlias('gm_fretless_bass', 'fretless_bass');
  soundAlias('gm_slap_bass_1', 'slap_bass_1');
  soundAlias('gm_slap_bass_2', 'slap_bass_2');
  soundAlias('gm_synth_bass_1', 'synth_bass_1');
  soundAlias('gm_synth_bass_2', 'synth_bass_2');
  soundAlias('gm_violin', 'violin');
  soundAlias('gm_viola', 'viola');
  soundAlias('gm_cello', 'cello');
  soundAlias('gm_contrabass', 'contrabass');
  soundAlias('gm_tremolo_strings', 'tremolo_strings');
  soundAlias('gm_pizzicato_strings', 'pizzicato_strings');
  soundAlias('gm_orchestral_harp', 'orchestral_harp');
  soundAlias('gm_timpani', 'timpani');
  soundAlias('gm_string_ensemble_1', 'string_ensemble_1');
  soundAlias('gm_string_ensemble_2', 'string_ensemble_2');
  soundAlias('gm_synth_strings_1', 'synth_strings_1');
  soundAlias('gm_synth_strings_2', 'synth_strings_2');
  soundAlias('gm_choir_aahs', 'choir_aahs');
  soundAlias('gm_voice_oohs', 'voice_oohs');
  soundAlias('gm_synth_choir', 'synth_choir');
  soundAlias('gm_orchestra_hit', 'orchestra_hit');
  soundAlias('gm_trumpet', 'trumpet');
  soundAlias('gm_trombone', 'trombone');
  soundAlias('gm_tuba', 'tuba');
  soundAlias('gm_muted_trumpet', 'muted_trumpet');
  soundAlias('gm_french_horn', 'french_horn');
  soundAlias('gm_brass_section', 'brass_section');
  soundAlias('gm_synth_brass_1', 'synth_brass_1');
  soundAlias('gm_synth_brass_2', 'synth_brass_2');
  soundAlias('gm_soprano_sax', 'soprano_sax');
  soundAlias('gm_alto_sax', 'alto_sax');
  soundAlias('gm_tenor_sax', 'tenor_sax');
  soundAlias('gm_baritone_sax', 'baritone_sax');
  soundAlias('gm_oboe', 'oboe');
  soundAlias('gm_english_horn', 'english_horn');
  soundAlias('gm_bassoon', 'bassoon');
  soundAlias('gm_clarinet', 'clarinet');
  soundAlias('gm_piccolo', 'piccolo');
  soundAlias('gm_flute', 'flute');
  soundAlias('gm_recorder', 'recorder');
  soundAlias('gm_pan_flute', 'pan_flute');
  soundAlias('gm_blown_bottle', 'blown_bottle');
  soundAlias('gm_shakuhachi', 'shakuhachi');
  soundAlias('gm_whistle', 'whistle');
  soundAlias('gm_ocarina', 'ocarina');
  soundAlias('gm_lead_1_square', 'lead_1_square');
  soundAlias('gm_lead_2_sawtooth', 'lead_2_sawtooth');
  soundAlias('gm_lead_3_calliope', 'lead_3_calliope');
  soundAlias('gm_lead_4_chiff', 'lead_4_chiff');
  soundAlias('gm_lead_5_charang', 'lead_5_charang');
  soundAlias('gm_lead_6_voice', 'lead_6_voice');
  soundAlias('gm_lead_7_fifths', 'lead_7_fifths');
  soundAlias('gm_lead_8_bass_lead', 'lead_8_bass_lead');
  soundAlias('gm_pad_new_age', 'pad_new_age');
  soundAlias('gm_pad_warm', 'pad_warm');
  soundAlias('gm_pad_poly', 'pad_poly');
  soundAlias('gm_pad_choir', 'pad_choir');
  soundAlias('gm_pad_bowed', 'pad_bowed');
  soundAlias('gm_pad_metallic', 'pad_metallic');
  soundAlias('gm_pad_halo', 'pad_halo');
  soundAlias('gm_pad_sweep', 'pad_sweep');
  soundAlias('gm_fx_rain', 'fx_rain');
  soundAlias('gm_fx_soundtrack', 'fx_soundtrack');
  soundAlias('gm_fx_crystal', 'fx_crystal');
  soundAlias('gm_fx_atmosphere', 'fx_atmosphere');
  soundAlias('gm_fx_brightness', 'fx_brightness');
  soundAlias('gm_fx_goblins', 'fx_goblins');
  soundAlias('gm_fx_echoes', 'fx_echoes');
  soundAlias('gm_fx_sci_fi', 'fx_sci_fi');
  soundAlias('gm_sitar', 'sitar');
  soundAlias('gm_banjo', 'banjo');
  soundAlias('gm_shamisen', 'shamisen');
  soundAlias('gm_koto', 'koto');
  soundAlias('gm_kalimba', 'kalimba');
  soundAlias('gm_bagpipe', 'bagpipe');
  soundAlias('gm_fiddle', 'fiddle');
  soundAlias('gm_shanai', 'shanai');
  soundAlias('gm_tinkle_bell', 'tinkle_bell');
  soundAlias('gm_agogo', 'agogo');
  soundAlias('gm_steel_drums', 'steel_drums');
  soundAlias('gm_woodblock', 'woodblock');
  soundAlias('gm_taiko_drum', 'taiko_drum');
  soundAlias('gm_melodic_tom', 'melodic_tom');
  soundAlias('gm_synth_drum', 'synth_drum');
  soundAlias('gm_reverse_cymbal', 'reverse_cymbal');
  soundAlias('gm_guitar_fret_noise', 'guitar_fret_noise');
  soundAlias('gm_breath_noise', 'breath_noise');
  soundAlias('gm_seashore', 'seashore');
  soundAlias('gm_bird_tweet', 'bird_tweet');
  soundAlias('gm_telephone', 'telephone');
  soundAlias('gm_helicopter', 'helicopter');
  soundAlias('gm_applause', 'applause');
  soundAlias('gm_gunshot', 'gunshot');
}

/**
 * Evaluate a string of Strudel pattern code and return a Pattern.
 */
export async function evaluatePattern(code) {
  const { pattern } = await evaluate(code, transpiler);
  if (!pattern || typeof pattern.queryArc !== 'function') {
    throw new Error('Code did not return a Strudel Pattern. Make sure your file exports a pattern expression.');
  }
  return pattern;
}

/** Return the CPS set by the pattern via setcps(), or null if not set. */
export function getPatternCps() {
  return strudelCore.getCps?.() ?? null;
}

async function renderChunk({
  haps, beginCyc, cps, renderDur, sampleRate, workletsPath,
}) {
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
      await superdough(
        hap2value(hap),
        onsetSec,
        hap.duration.valueOf() / cps,
        cps,
        onsetSec,
      );
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
export async function renderToBuffer(pattern, { duration = 60, cps = 1, sampleRate = 44100, verbose = false } = {}) {
  const workletsPath = fileURLToPath(new URL('./superdough-worklets.js', import.meta.url));

  const chunkDur = 3;
  const minTail = 2;   // minimum extra seconds beyond chunkDur for reverb/delay tails
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
    getChannelData(ch) { return ch === 0 ? outL : outR; },
  };
}
