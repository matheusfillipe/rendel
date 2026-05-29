import Fuse from 'fuse.js';
import { ApiError } from './errors.js';

// Real, human-made Strudel tunes are fetched at runtime from the upstream
// repo rather than bundled, so the library stays current without shipping a
// copy. Results are cached in memory with a TTL; on a fetch failure a stale
// cache is served instead of erroring.
const SOURCE_URL =
  process.env.EXAMPLES_SOURCE_URL ||
  'https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/tunes.mjs';
const TTL_MS = Number(process.env.EXAMPLES_TTL_MS ?? 3_600_000);

let cache = { at: 0, items: [], fuse: null };

export async function getIndex() {
  if (cache.items.length && Date.now() - cache.at < TTL_MS) {
    return cache;
  }
  let text;
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    text = await res.text();
  } catch (err) {
    if (cache.items.length) return cache;
    throw new ApiError(502, `could not fetch examples source: ${err.message}`);
  }
  const items = parseTunes(text);
  const fuse = new Fuse(items, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'author', weight: 2 },
      { name: 'id', weight: 2 },
      { name: 'tags', weight: 2 },
      { name: 'code', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  cache = { at: Date.now(), items, fuse };
  return cache;
}

export async function searchExamples({ q = '', page = 1, limit = 20 } = {}) {
  const { items, fuse } = await getIndex();
  const matched = q ? fuse.search(q).map((r) => r.item) : items;
  const start = (page - 1) * limit;
  return {
    total: matched.length,
    page,
    limit,
    results: matched.slice(start, start + limit).map(toSummary),
  };
}

export async function getExample(id) {
  const { items } = await getIndex();
  const item = items.find((e) => e.id === id);
  if (!item) return null;
  return { ...item, lines: item.code.split('\n').length, chars: item.code.length };
}

function toSummary(item) {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    tags: item.tags,
    lines: item.code.split('\n').length,
    chars: item.code.length,
    snippet: item.code.slice(0, 200),
  };
}

function parseTunes(text) {
  const re = /export const (\w+)\s*=\s*`([\s\S]*?)`\s*;/g;
  const items = [];
  for (const match of text.matchAll(re)) {
    const id = match[1];
    const code = match[2].trim();
    items.push({ id, code, ...metadata(id, code) });
  }
  if (!items.length) {
    throw new ApiError(502, 'examples source returned no parseable entries');
  }
  return items;
}

// Most tunes carry a leading comment block with a human title and author
// (e.g. `// Title - Author`, `// @by ...`, `// @title ...`). Pull those out and
// derive a few coarse tags from the code so search has something to match.
function metadata(id, code) {
  let title = null;
  let author = null;
  for (const raw of code.split('\n').slice(0, 8)) {
    const line = raw.trim();
    if (!line.startsWith('//')) {
      if (line) break;
      continue;
    }
    const text = line.replace(/^\/+\s?/, '');
    const by = text.match(/@by\s+(.+)/i);
    if (by) {
      author = by[1].trim();
      continue;
    }
    const ti = text.match(/@title\s+(.+)/i);
    if (ti) {
      title = ti[1].trim();
      continue;
    }
    if (/@\w+|creativecommons|license/i.test(text)) continue;
    if (!title) {
      // cover tunes are written "Composer - Song Title"
      const dash = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (dash) {
        author = author || strip(dash[1]);
        title = strip(dash[2]);
      } else {
        title = strip(text);
      }
    }
  }
  const tags = [];
  for (const word of [
    'drums',
    'bass',
    'chord',
    'ambient',
    'techno',
    'piano',
    'arp',
    'acid',
    'lofi',
    'kalimba',
  ]) {
    if (new RegExp(`\\b${word}`, 'i').test(code)) tags.push(word);
  }
  return { title: title || humanize(id), author, tags };
}

function strip(s) {
  return s.replace(/^["']|["']$/g, '').trim();
}

function humanize(id) {
  return id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}
