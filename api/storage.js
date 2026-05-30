import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'minio';
import { MIME } from './render.js';

// The endpoint is the public S3 host rather than the in-cluster service because
// render pods are typically egress-locked to the public internet only (SSRF
// defense) and cannot reach MinIO's ClusterIP.
const ENDPOINT = process.env.MINIO_ENDPOINT || '';
const USE_SSL = (process.env.MINIO_USE_SSL ?? 'true') !== 'false';
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY || '';
const SECRET_KEY = process.env.MINIO_SECRET_KEY || '';
const BUCKET = process.env.MINIO_BUCKET || '';
const REGION = process.env.MINIO_REGION || 'us-east-1';
const PUBLIC_BASE = (process.env.MINIO_PUBLIC_BASE || '').replace(/\/+$/, '');

export function isStorageConfigured() {
  return Boolean(ENDPOINT && ACCESS_KEY && SECRET_KEY && BUCKET && PUBLIC_BASE);
}

let client;
function getClient() {
  if (!client) {
    const [host, port] = ENDPOINT.split(':');
    client = new Client({
      endPoint: host,
      port: port ? Number(port) : USE_SSL ? 443 : 80,
      useSSL: USE_SSL,
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
    });
  }
  return client;
}

function redirectHtml(target) {
  return (
    '<!doctype html><html><head>' +
    `<meta http-equiv="refresh" content="0; url=${target}">` +
    '<title>Open in Strudel</title></head>' +
    `<body><a href="${target}">Open in Strudel →</a></body></html>`
  );
}

// Upload the render plus sidecar artifacts under one random basename so they're
// trivially matched: <id>.<fmt> (audio), <id>.json (provenance — where the song
// came from), and, when there's a share link, <id>.html (a redirect to the
// strudel.cc editor, served from the bucket so callers needn't paste elsewhere).
// The bucket's public-read policy makes every returned URL resolve without
// credentials.
export async function uploadArtifacts(filePath, format, meta = {}) {
  const audio = await readFile(filePath);
  const base = `renders/${randomUUID()}`;
  const client = getClient();

  await client.putObject(BUCKET, `${base}.${format}`, audio, audio.length, {
    'Content-Type': MIME[format] || 'application/octet-stream',
  });
  const sidecar = Buffer.from(JSON.stringify(meta, null, 2), 'utf8');
  await client.putObject(BUCKET, `${base}.json`, sidecar, sidecar.length, {
    'Content-Type': 'application/json',
  });

  const result = {
    url: `${PUBLIC_BASE}/${base}.${format}`,
    json_url: `${PUBLIC_BASE}/${base}.json`,
    bytes: audio.length,
  };
  if (meta.share_url) {
    const html = Buffer.from(redirectHtml(meta.share_url), 'utf8');
    await client.putObject(BUCKET, `${base}.html`, html, html.length, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    result.edit_url = `${PUBLIC_BASE}/${base}.html`;
  }
  return result;
}
