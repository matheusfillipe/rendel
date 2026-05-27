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

/** True if the buffer clips (peak >= 1.0). */
export function isClipping(buf) {
  return getPeak(buf) >= 1.0;
}

/** Get a segment of channel data for inspection. */
export function getSegment(buf, channel = 0, startSec = 0, durationSec = 1) {
  const data = buf.getChannelData(channel);
  const start = Math.floor(startSec * buf.sampleRate);
  const end = Math.min(Math.floor((startSec + durationSec) * buf.sampleRate), data.length);
  return data.slice(start, end);
}

/** Compute spectral centroid of a segment (simple DFT on first N samples). */
export function spectralCentroid(buf, channel = 0, startSec = 0, durationSec = 0.5) {
  const data = getSegment(buf, channel, startSec, durationSec);
  const N = Math.min(data.length, 4096);
  if (N === 0) return 0;

  // Simple magnitude spectrum via DFT (only positive frequencies)
  const maxK = Math.floor(N / 2);
  let weightedSum = 0;
  let totalMag = 0;

  for (let k = 0; k < maxK; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += data[n] * Math.cos(angle);
      im -= data[n] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    const freq = (k * buf.sampleRate) / N;
    weightedSum += freq * mag;
    totalMag += mag;
  }

  return totalMag > 0 ? weightedSum / totalMag : 0;
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
      let re = 0, im = 0;
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

/**
 * Compare two buffers: returns correlation coefficient (-1 to 1).
 * 1.0 = identical, 0 = uncorrelated, -1 = inverted.
 */
export function correlation(bufA, bufB) {
  const LA = bufA.getChannelData(0);
  const RA = bufA.getChannelData(1);
  const LB = bufB.getChannelData(0);
  const RB = bufB.getChannelData(1);
  const len = Math.min(LA.length, LB.length);

  let sumA = 0, sumB = 0, sumAB = 0;
  for (let i = 0; i < len; i++) {
    const a = (LA[i] + RA[i]) / 2;
    const b = (LB[i] + RB[i]) / 2;
    sumA += a * a;
    sumB += b * b;
    sumAB += a * b;
  }

  const denom = Math.sqrt(sumA * sumB);
  return denom > 0 ? sumAB / denom : 0;
}
