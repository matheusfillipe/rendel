const STRUDEL_BASE = process.env.STRUDEL_BASE_URL || 'https://strudel.cc';

// Mirror strudel.cc's own code2hash: base64 of the UTF-8 source, then
// encodeURIComponent. The REPL decodes the fragment with
// base64ToUnicode(decodeURIComponent(hash)); without the encodeURIComponent the
// raw base64's '+' and '=' get mangled in the URL fragment and the editor loads
// empty. No server round-trip is involved.
export function shareUrl(code, base = STRUDEL_BASE) {
  const encoded = encodeURIComponent(Buffer.from(code, 'utf8').toString('base64'));
  return `${base}/#${encoded}`;
}
