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
import { GM_INSTRUMENTS, GM_NICKNAMES } from './gm-instruments.js';
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

/** Stable, order-independent signature of a hap's control value, with numbers
 * rounded so float noise doesn't break cross-cycle comparison. */
function valueSignature(value) {
  if (value == null || typeof value !== 'object') {
    return typeof value === 'number' ? value.toFixed(6) : String(value);
  }
  return Object.keys(value)
    .sort()
    .map((k) => `${k}=${valueSignature(value[k])}`)
    .join(',');
}

/**
 * Find the loop period of a pattern in whole cycles: the smallest P such that
 * the events repeat every P cycles. Strudel patterns are infinite loops, so a
 * structured piece built with arrange(...) repeats every `sum(cycles)` — that
 * sum is what this returns, letting a caller render exactly one pass instead of
 * capturing a fixed wall-clock slice that restarts mid-file.
 *
 * Returns null when no period is detectable within `maxCycles` — true
 * randomness (rand/irand/unseeded shuffle) or a period longer than the window
 * — so the caller falls back to the requested duration.
 *
 * @param {object} pattern - a Strudel Pattern (must expose queryArc)
 * @param {object} [opts]
 * @param {number} [opts.cps] - cycles per second, passed to the query context
 * @param {number} [opts.maxCycles] - how many cycles to inspect (≥2 periods needed)
 * @returns {number|null} period in whole cycles, or null
 */
export function detectLoopPeriod(pattern, { cps = 1, maxCycles = 64 } = {}) {
  const max = Math.max(2, Math.floor(maxCycles));

  // Query one cycle at a time. A wide single query aborts wholesale if any span
  // errors (e.g. a broken layer in one section), but the renderer schedules in
  // small windows, so detection must too: a broken cycle just blanks itself.
  // Because such breakage recurs at the same position every loop, the period is
  // still detectable.
  const cycleSig = new Array(max);
  let anySound = false;
  for (let c = 0; c < max; c++) {
    let haps;
    try {
      haps = pattern.queryArc(c, c + 1, { _cps: cps }).filter((h) => h.hasOnset());
    } catch {
      cycleSig[c] = null; // unrenderable cycle — a consistent state across loops
      continue;
    }
    const sigs = [];
    for (const hap of haps) {
      try {
        hap.ensureObjectValue();
      } catch {
        continue; // skip a single unrenderable hap
      }
      const offset = (hap.whole.begin.valueOf() - c).toFixed(6);
      sigs.push(`${offset}|${hap.duration.valueOf().toFixed(6)}|${valueSignature(hap.value)}`);
    }
    sigs.sort();
    if (sigs.length > 0) anySound = true;
    cycleSig[c] = sigs;
  }
  if (!anySound) return null;

  const cycleEqual = (a, b) => {
    if (a === null || b === null) return a === b;
    return a.length === b.length && a.every((s, i) => s === b[i]);
  };

  for (let period = 1; period <= Math.floor(max / 2); period++) {
    let matches = true;
    for (let c = period; c < max; c++) {
      if (!cycleEqual(cycleSig[c], cycleSig[c - period])) {
        matches = false;
        break;
      }
    }
    if (matches) return period;
  }
  return null;
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
  {
    duration = 60,
    cps = 1,
    sampleRate = 44100,
    verbose = false,
    loopCycles = null,
    trimSilence = false,
  } = {},
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

    // Query haps with onset in this chunk window. When loopCycles is set, drop
    // onsets at or past the loop boundary so the next pass never bleeds into the
    // tail — notes that started earlier still ring out from their own chunk.
    const haps = pattern
      .queryArc(beginCyc, endCyc, { _cps: cps })
      .filter((h) => h.hasOnset())
      .filter((h) => loopCycles == null || h.whole.begin.valueOf() < loopCycles)
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

  // When trimSilence is set (auto-fit one-pass renders), cut the trailing
  // silence after the final decay so the file ends on the music, not on the
  // tail budget we reserved for it.
  let outLen = totalFrames;
  if (trimSilence) {
    const threshold = 1e-4; // ~-80 dBFS — below audibility
    let lastSound = -1;
    for (let i = totalFrames - 1; i >= 0; i--) {
      if (Math.abs(outL[i]) > threshold || Math.abs(outR[i]) > threshold) {
        lastSound = i;
        break;
      }
    }
    const pad = Math.round(0.05 * sampleRate);
    const minLen = Math.min(totalFrames, Math.round(0.5 * sampleRate));
    outLen = lastSound < 0 ? minLen : Math.min(totalFrames, Math.max(minLen, lastSound + pad));
  }

  // Return an AudioBuffer-compatible plain object — export.js only uses
  // numberOfChannels, sampleRate, and getChannelData().
  return {
    numberOfChannels: 2,
    sampleRate,
    length: outLen,
    duration: outLen / sampleRate,
    getChannelData(ch) {
      const data = ch === 0 ? outL : outR;
      return outLen === totalFrames ? data : data.subarray(0, outLen);
    },
  };
}
