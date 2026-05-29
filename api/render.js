import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from './errors.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'src', 'cli.js');

export const FORMATS = ['wav', 'mp3', 'flac', 'ogg'];
export const MIME = { wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg' };
const SAMPLE_RATES = [22050, 44100, 48000, 88200, 96000];

const MAX_DURATION = Number(process.env.RENDEL_MAX_DURATION ?? 180);
const TIMEOUT_MS = Number(process.env.RENDEL_TIMEOUT_MS ?? 300_000);
const MAX_CONCURRENCY = Number(process.env.RENDEL_MAX_CONCURRENCY ?? 2);

let active = 0;

// A render is bounded by its requested duration — the engine renders exactly N
// seconds of output and stops, so a pattern cannot run away. CPU is capped by
// the duration limit, a wall-clock kill, a concurrency gate, and by killing the
// child when the caller aborts (e.g. the HTTP client disconnects). Each render
// runs in its own child process writing to a throwaway temp dir.
export async function renderToFile(code, opts = {}, signal) {
  if (active >= MAX_CONCURRENCY) {
    throw new ApiError(429, 'renderer busy, retry shortly');
  }
  const args = buildArgs(opts); // validates synchronously, before claiming a slot
  const format = args.format;

  // Claim the slot synchronously (no await between the gate check and this
  // increment) so a burst of concurrent calls cannot all slip past the gate.
  active++;
  const dir = await mkdtemp(join(tmpdir(), 'rendel-'));
  const inFile = join(dir, 'pattern.js');
  const outFile = join(dir, `render.${format}`);
  try {
    await writeFile(inFile, code, 'utf8');
    await runCli(['-f', inFile, '-o', outFile, ...args.rest], signal);
    return { dir, outFile, format, duration: args.duration };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  } finally {
    active--;
  }
}

function buildArgs(opts) {
  const format = String(opts.format || 'wav').toLowerCase();
  if (!FORMATS.includes(format)) {
    throw new ApiError(400, `format must be one of: ${FORMATS.join(', ')}`);
  }
  const duration = clamp(Number(opts.duration) || 30, 1, MAX_DURATION);
  const sampleRate = Number(opts.sampleRate ?? 44100);
  if (!SAMPLE_RATES.includes(sampleRate)) {
    throw new ApiError(400, `samplerate must be one of: ${SAMPLE_RATES.join(', ')}`);
  }
  const rest = ['-d', String(duration), '-r', String(sampleRate), '-q'];
  if (opts.quality != null && opts.quality !== '') {
    const quality = Number(opts.quality);
    if (!Number.isInteger(quality)) {
      throw new ApiError(400, 'quality must be an integer');
    }
    rest.push('--quality', String(quality));
  }
  // Auto-fit one-pass rendering is on by default; ?exact=true renders the
  // literal requested duration (looping short patterns to fill it).
  if (isTruthy(opts.exact)) {
    rest.push('--exact');
  }
  return { format, duration, rest };
}

function isTruthy(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === '';
}

function runCli(args, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(499, 'client closed request'));
      return;
    }
    const proc = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    const onAbort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    proc.on('error', (err) => {
      cleanup();
      reject(err);
    });
    proc.on('close', (code) => {
      cleanup();
      if (signal?.aborted) {
        reject(new ApiError(499, 'client closed request'));
      } else if (timedOut) {
        reject(new ApiError(504, `render exceeded ${Math.round(TIMEOUT_MS / 1000)}s limit`));
      } else if (code === 0) {
        resolve();
      } else {
        const last = stderr.trim().split('\n').pop() || 'render failed';
        reject(new ApiError(422, last.replace(/^Error:\s*/, '')));
      }
    });
  });
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}
