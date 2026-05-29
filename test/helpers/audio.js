/**
 * Audio analysis helpers for testing.
 * All functions accept objects with getChannelData(ch) and sampleRate.
 */

/** Root-mean-square of a buffer (stereo). */
export function getRMS(buf) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let sum = 0;
  for (let i = 0; i < L.length; i++) sum += L[i] * L[i] + R[i] * R[i];
  return Math.sqrt(sum / (L.length * 2));
}

/** Peak amplitude of a buffer (stereo). */
export function getPeak(buf) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  return peak;
}

/** True if the buffer is effectively silent (RMS < threshold). */
export function isSilent(buf, threshold = 0.001) {
  return getRMS(buf) < threshold;
}

/** Get a segment of channel data for inspection. */
function getSegment(buf, channel = 0, startSec = 0, durationSec = 1) {
  const data = buf.getChannelData(channel);
  const start = Math.floor(startSec * buf.sampleRate);
  const end = Math.min(Math.floor((startSec + durationSec) * buf.sampleRate), data.length);
  return data.slice(start, end);
}

/** Compute energy in a frequency band (Hz). */
export function bandEnergy(buf, lowHz, highHz, channel = 0, startSec = 0, durationSec = 0.5) {
  const data = getSegment(buf, channel, startSec, durationSec);
  const N = Math.min(data.length, 4096);
  if (N === 0) return 0;

  const maxK = Math.floor(N / 2);
  let energy = 0;

  for (let k = 0; k < maxK; k++) {
    const freq = (k * buf.sampleRate) / N;
    if (freq >= lowHz && freq <= highHz) {
      let re = 0,
        im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        re += data[n] * Math.cos(angle);
        im -= data[n] * Math.sin(angle);
      }
      energy += re * re + im * im;
    }
  }

  return energy;
}
