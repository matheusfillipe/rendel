#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Command } from 'commander';
import { inferFormat, writeAudio } from './export.js';
import {
  detectLoopPeriod,
  evaluatePattern,
  getPatternCps,
  renderToBuffer,
  setupScope,
} from './renderer.js';

const program = new Command();

program
  .name('rendel')
  .description('Render a Strudel pattern file to WAV/MP3/FLAC/OGG offline')
  .requiredOption('-f, --file <path>', 'path to .js Strudel pattern file')
  .requiredOption('-o, --output <path>', 'output file path (e.g. out.wav)')
  .option('-d, --duration <seconds>', 'render duration in seconds', parseFloat, 60)
  .option('-r, --samplerate <hz>', 'sample rate in Hz', (v) => parseInt(v, 10), 44100)
  .option('--cps <value>', 'cycles per second (tempo)', parseFloat, 1)
  .option('--format <fmt>', 'override output format (wav, mp3, flac, ogg)')
  .option(
    '--quality <n>',
    'encoding quality (MP3: 0-9 VBR, lower=better; OGG: 1-10; FLAC: compression 0-8)',
    (v) => parseInt(v, 10),
  )
  .option('-q, --quiet', 'quiet mode — only errors', false)
  .option('-p, --progress', 'show per-chunk progress', false)
  .option(
    '--exact',
    'render the literal --duration instead of auto-fitting to the pattern loop',
    false,
  );

program.parse();

const opts = program.opts();
const quiet = opts.quiet;

// --- Input validation ---

const filePath = resolve(opts.file);
if (!existsSync(filePath)) {
  console.error(`Error: file not found: ${filePath}`);
  process.exit(1);
}
if (extname(filePath).toLowerCase() !== '.js') {
  console.error(`Error: --file must be a .js file, got: ${extname(filePath)}`);
  process.exit(1);
}

let outputPath = resolve(opts.output);
const requestedFormat = opts.format;

// If --format is specified, override the extension
if (requestedFormat) {
  if (!['wav', 'mp3', 'flac', 'ogg'].includes(requestedFormat)) {
    console.error(`Error: --format must be wav, mp3, flac, or ogg, got: ${requestedFormat}`);
    process.exit(1);
  }
  // Replace extension
  const ext = extname(outputPath);
  outputPath = `${outputPath.slice(0, outputPath.length - ext.length)}.${requestedFormat}`;
}

const actualFormat = inferFormat(outputPath);
if (!actualFormat) {
  console.error(`Error: --output must be .wav, .mp3, .flac, or .ogg — got: ${extname(outputPath)}`);
  process.exit(1);
}

const { duration, samplerate: sampleRate } = opts;
const cpsExplicit = process.argv.some((a) => a === '--cps');
let cps = opts.cps;

if (Number.isNaN(duration) || duration <= 0) {
  console.error(`Error: --duration must be a positive number, got: ${opts.duration}`);
  process.exit(1);
}
if (Number.isNaN(sampleRate) || ![22050, 44100, 48000, 88200, 96000].includes(sampleRate)) {
  console.error(
    `Error: --samplerate must be one of 22050, 44100, 48000, 88200, 96000, got: ${opts.samplerate}`,
  );
  process.exit(1);
}
if (Number.isNaN(cps) || cps <= 0) {
  console.error(`Error: --cps must be a positive number, got: ${opts.cps}`);
  process.exit(1);
}

// --- Render ---

if (!quiet) console.log(`rendel: reading ${filePath}`);
const code = await readFile(filePath, 'utf8');

const t0 = Date.now();

try {
  if (!quiet) console.log('rendel: setting up Strudel scope...');
  await setupScope();

  if (!quiet) console.log('rendel: evaluating pattern...');
  const pattern = await evaluatePattern(code);

  // If the pattern set cps via setcps() and the user didn't pass --cps, use it
  if (!cpsExplicit) {
    const patternCps = getPatternCps();
    if (patternCps != null && patternCps > 0) {
      cps = patternCps;
    }
  }

  // Auto-fit: Strudel patterns loop forever, so rendering a fixed wall-clock
  // duration restarts a finished song mid-file. Detect the loop length and, when
  // the piece is roughly the requested length (i.e. a deliberate composition,
  // not a short groove meant to repeat), render exactly one pass ending on its
  // own resolution. Short loops and undetectable (random) patterns fall through
  // to the literal duration.
  let renderDuration = duration;
  let loopCycles = null;
  let trimSilence = false;
  if (!opts.exact) {
    const maxCycles = Math.min(Math.max(8, Math.ceil(duration * cps * 2.5) + 4), 256);
    const period = detectLoopPeriod(pattern, { cps, maxCycles });
    if (period != null) {
      const songSeconds = period / cps;
      if (songSeconds >= duration * 0.5 && songSeconds <= duration * 1.5) {
        renderDuration = songSeconds + 8; // tail budget for the final decay; trimmed after
        loopCycles = period;
        trimSilence = true;
      }
    }
  }

  if (!quiet) {
    const fit = loopCycles != null ? ` (auto-fit to ${loopCycles}-cycle loop)` : '';
    console.log(
      `rendel: rendering ${renderDuration.toFixed(1)}s at ${sampleRate}Hz (cps=${cps})${fit}...`,
    );
  }
  const buffer = await renderToBuffer(pattern, {
    duration: renderDuration,
    cps,
    sampleRate,
    verbose: opts.progress,
    loopCycles,
    trimSilence,
  });

  if (!quiet) console.log(`rendel: writing ${outputPath} (${actualFormat.toUpperCase()})`);
  await writeAudio(buffer, outputPath, { quality: opts.quality });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const fileSize = (await stat(outputPath)).size;
  const sizeStr =
    fileSize > 1024 * 1024
      ? `${(fileSize / 1024 / 1024).toFixed(1)} MB`
      : `${(fileSize / 1024).toFixed(0)} KB`;

  if (!quiet) {
    console.log(
      `rendel: done in ${elapsed}s — ${outputPath} (${sizeStr}, ${buffer.duration.toFixed(1)}s, ${actualFormat.toUpperCase()})`,
    );
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  if (process.env.RENDEL_DEBUG) console.error(err.stack);
  process.exit(1);
}
