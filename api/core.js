import { rm } from 'node:fs/promises';
import { ApiError } from './errors.js';
import { renderToFile } from './render.js';
import { isStorageConfigured, uploadRender } from './storage.js';

// Render code to audio, store it, and return the public URL. Shared by the REST
// ?upload path and the MCP render tool so the temp-dir cleanup and the
// storage-config guard live in exactly one place. MCP can't ship raw bytes, so
// it always goes through here.
export async function renderToUrl(code, opts = {}, signal) {
  if (!isStorageConfigured()) {
    throw new ApiError(503, 'object storage not configured (set the MinIO env)');
  }
  const { dir, outFile, format, duration } = await renderToFile(code, opts, signal);
  try {
    const { url, bytes } = await uploadRender(outFile, format);
    return { url, format, bytes, duration };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
