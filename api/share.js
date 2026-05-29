const STRUDEL_BASE = process.env.STRUDEL_BASE_URL || 'https://strudel.cc';

// The Strudel REPL carries the pattern as base64 of the UTF-8 source in the URL
// hash and decodes it on load — equivalent to the browser's
// btoa(unescape(encodeURIComponent(code))). No server round-trip is involved.
export function shareUrl(code, base = STRUDEL_BASE) {
  const encoded = Buffer.from(code, 'utf8').toString('base64');
  return `${base}/#${encoded}`;
}
