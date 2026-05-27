import { writeFile } from 'fs/promises';
import { extname } from 'path';
import { spawn } from 'child_process';

/**
 * Encode an AudioBuffer as a 16-bit PCM WAV ArrayBuffer.
 */
export function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;

  const result = numChannels === 2
    ? interleave(buffer.getChannelData(0), buffer.getChannelData(1))
    : buffer.getChannelData(0);

  return encodeWav(result, sampleRate, numChannels);
}

function encodeWav(samples, sampleRate, numChannels) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const buf = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buf);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buf;
}

function interleave(L, R) {
  const result = new Float32Array(L.length + R.length);
  let i = 0, j = 0;
  while (i < L.length) {
    result[j++] = L[i];
    result[j++] = R[i];
    i++;
  }
  return result;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Write an AudioBuffer to a WAV file on disk.
 */
export async function writeWav(buffer, outputPath) {
  const wavData = audioBufferToWav(buffer);
  await writeFile(outputPath, Buffer.from(wavData));
}

/**
 * Determine output format from file extension.
 * Returns 'wav' | 'mp3' | 'flac' | 'ogg'
 */
export function inferFormat(outputPath) {
  const ext = extname(outputPath).toLowerCase().slice(1);
  const supported = ['wav', 'mp3', 'flac', 'ogg'];
  return supported.includes(ext) ? ext : null;
}

/**
 * Check if ffmpeg is available on PATH.
 * Returns true if found, false otherwise.
 */
export function checkFfmpeg() {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Convert a WAV ArrayBuffer to the target format using ffmpeg.
 * Pipes WAV data to ffmpeg stdin and writes the result to outputPath.
 *
 * @param {ArrayBuffer} wavData
 * @param {string} outputPath
 * @param {string} format - 'mp3' | 'flac' | 'ogg'
 * @param {object} [options]
 * @param {number} [options.quality] - format-specific quality (MP3 VBR 0-9, OGG 1-10, FLAC compression 0-8)
 */
export function convertWithFfmpeg(wavData, outputPath, format, options = {}) {
  const ffmpegArgs = [
    '-y',           // overwrite output
    '-i', 'pipe:0', // read WAV from stdin
    ...formatArgs(format, options.quality),
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'ignore', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          'ffmpeg not found. Install it to export MP3/FLAC/OGG:\n' +
          '  Windows: https://ffmpeg.org/download.html (add to PATH)\n' +
          '  macOS:   brew install ffmpeg\n' +
          '  Linux:   apt install ffmpeg'
        ));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.trim()}`));
      } else {
        resolve();
      }
    });

    proc.stdin.write(Buffer.from(wavData));
    proc.stdin.end();
  });
}

function formatArgs(format, quality) {
  switch (format) {
    case 'mp3': {
      // VBR quality: 0 = best, 9 = worst (default: 2)
      const q = quality != null ? Math.max(0, Math.min(9, quality)) : 2;
      return ['-codec:a', 'libmp3lame', '-qscale:a', String(q)];
    }
    case 'flac': {
      // Compression level: 0 = fastest, 8 = best (default: 5)
      const q = quality != null ? Math.max(0, Math.min(8, quality)) : 5;
      return ['-codec:a', 'flac', '-compression_level', String(q)];
    }
    case 'ogg': {
      // Vorbis quality: -1 to 10 (default: 5)
      const q = quality != null ? Math.max(-1, Math.min(10, quality)) : 5;
      return ['-codec:a', 'libvorbis', '-qscale:a', String(q)];
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Write an AudioBuffer to disk in any supported format.
 * Uses WAV directly; delegates to ffmpeg for MP3/FLAC/OGG.
 *
 * @param {AudioBuffer} buffer
 * @param {string} outputPath
 * @param {object} [options]
 * @param {number} [options.quality] - encoding quality (format-specific)
 */
export async function writeAudio(buffer, outputPath, options = {}) {
  const format = inferFormat(outputPath);
  if (!format) {
    throw new Error(`Unsupported output format: ${extname(outputPath)}`);
  }

  const wavData = audioBufferToWav(buffer);

  if (format === 'wav') {
    await writeFile(outputPath, Buffer.from(wavData));
    return;
  }

  // Non-WAV: requires ffmpeg
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    throw new Error(
      'ffmpeg not found. Install it to export MP3/FLAC/OGG:\n' +
      '  Windows: https://ffmpeg.org/download.html (add to PATH)\n' +
      '  macOS:   brew install ffmpeg\n' +
      '  Linux:   apt install ffmpeg'
    );
  }

  await convertWithFfmpeg(wavData, outputPath, format, options);
}
