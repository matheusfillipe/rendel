import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import express from 'express';
import { ApiError } from './errors.js';
import { getExample, searchExamples } from './examples.js';
import { FORMATS, MIME, renderToFile } from './render.js';
import { shareUrl } from './share.js';
import { getSounds } from './sounds.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.text({ type: ['text/*', 'application/javascript'], limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/', (_req, res) =>
  res.json({
    name: 'rendel',
    description: 'Stateless Strudel pattern renderer, example library, and share-link service',
    endpoints: {
      'POST /render':
        'render pattern code to audio (?format=wav|mp3|flac|ogg, ?duration, ?samplerate, ?quality)',
      'GET /examples': 'list / fuzzy-search real Strudel example tunes (?q, ?page, ?limit)',
      'GET /examples/:id': 'full code + metadata for one example',
      'GET /sounds': 'catalog of playable sounds — samples, soundfonts, synths',
      'POST /share': 'build a strudel.cc share URL for pattern code',
    },
    formats: FORMATS,
  }),
);

app.get('/sounds', async (_req, res, next) => {
  try {
    res.json(await getSounds());
  } catch (err) {
    next(err);
  }
});

app.post('/render', async (req, res, next) => {
  const controller = new AbortController();
  // res 'close' fires on real completion or on client disconnect; only the
  // latter (response not yet flushed) should cancel the in-flight render.
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  let cleanup;
  try {
    const code = readCode(req);
    const { dir, outFile, format } = await renderToFile(code, optionsFrom(req), controller.signal);
    cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
    res.on('close', cleanup);
    if (controller.signal.aborted) {
      cleanup();
      return;
    }
    res.setHeader('Content-Type', MIME[format]);
    res.setHeader('Content-Disposition', `inline; filename="render.${format}"`);
    const stream = createReadStream(outFile);
    stream.on('error', (err) => {
      cleanup();
      if (res.headersSent) res.destroy(err);
      else next(err);
    });
    stream.pipe(res);
  } catch (err) {
    cleanup?.();
    if (err?.status === 499) return; // client already gone
    next(err);
  }
});

app.get('/examples', async (req, res, next) => {
  try {
    res.json(
      await searchExamples({
        q: String(req.query.q ?? req.query.search ?? ''),
        page: Math.max(1, Number(req.query.page) || 1),
        limit: Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.get('/examples/:id', async (req, res, next) => {
  try {
    const example = await getExample(req.params.id);
    if (!example) throw new ApiError(404, 'example not found');
    res.json(example);
  } catch (err) {
    next(err);
  }
});

app.post('/share', (req, res, next) => {
  try {
    res.json({ url: shareUrl(readCode(req)) });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'internal error' });
});

function readCode(req) {
  const code = typeof req.body === 'string' ? req.body : req.body?.code;
  if (!code || typeof code !== 'string') {
    throw new ApiError(400, 'provide pattern code as a text/plain body or JSON {"code": "..."}');
  }
  return code;
}

function optionsFrom(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const pick = (key) => body[key] ?? req.query[key];
  return {
    format: pick('format'),
    duration: pick('duration'),
    sampleRate: pick('samplerate') ?? pick('sampleRate'),
    quality: pick('quality'),
  };
}

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`rendel-api listening on :${port}`));
