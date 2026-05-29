import { readFileSync } from 'node:fs';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { renderToUrl } from '../core.js';
import { getExample, searchExamples } from '../examples.js';
import { shareUrl } from '../share.js';
import { getSounds } from '../sounds.js';

const GUIDE = readFileSync(new URL('./guide.md', import.meta.url), 'utf8');

// Short cross-tool workflow steer for the system prompt; the full pedagogical
// guide lives in the compose_strudel prompt (clients may disable instructions).
const SERVER_INSTRUCTIONS =
  'Compose Strudel music. Explore with strudel_list_sounds + strudel_search_examples / ' +
  'strudel_get_example, write the code, then strudel_render to get a public audio URL. ' +
  'Mini-notation needs DOUBLE quotes. Fetch the compose_strudel prompt for the full guide.';

// A fresh server per request (the HTTP route is stateless), but the wiring is
// identical every time, so it lives here.
export function createMcpServer() {
  const server = new McpServer(
    { name: 'rendel', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // The composition guide as a prompt — the one thing a client fetches and uses
  // as the model's instructions. Clients that ignore MCP resources still get the
  // full guidance this way.
  server.registerPrompt(
    'compose_strudel',
    {
      title: 'Compose Strudel music',
      description: 'Full guidance for composing a coherent Strudel piece and rendering it.',
    },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: GUIDE } }] }),
  );

  server.registerTool(
    'strudel_render',
    {
      title: 'Render Strudel to audio',
      description:
        'Render Strudel code and return a public audio URL. Mini-notation needs DOUBLE quotes. ' +
        'The renderer auto-detects the loop and plays the arrangement once, ending on your coda; ' +
        'set duration to about the song length (sum of arrange cycles ÷ cps).',
      inputSchema: {
        code: z.string().describe('Strudel code to render'),
        format: z
          .enum(['mp3', 'wav', 'flac', 'ogg'])
          .optional()
          .describe('audio format (default mp3)'),
        duration: z.number().int().positive().optional().describe('seconds to render (default 30)'),
        exact: z
          .boolean()
          .optional()
          .describe('render the literal duration instead of auto-fitting the loop'),
      },
    },
    async ({ code, format = 'mp3', duration, exact }) => {
      try {
        const r = await renderToUrl(code, { format, duration, exact });
        const secs = r.duration ? ` (~${r.duration}s)` : '';
        return {
          content: [
            {
              type: 'text',
              text: `Rendered ${r.format}${secs}, ${r.bytes} bytes.\naudio_url: ${r.url}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `render failed: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'strudel_search_examples',
    {
      title: 'Search real Strudel examples',
      description:
        'Fuzzy-search the library of real human Strudel tunes. Returns ids + snippets; pass an id ' +
        'to strudel_get_example to read the full code.',
      inputSchema: {
        q: z.string().describe('search query: style, instrument, or author'),
        limit: z.number().int().positive().optional().describe('max results (default 5)'),
        page: z.number().int().positive().optional(),
      },
    },
    async ({ q, limit = 5, page = 1 }) => {
      const res = await searchExamples({ q, limit, page });
      const lines = res.results
        .map((r) => `${r.id} — ${r.title} by ${r.author ?? '?'} [${(r.tags || []).join(',')}]`)
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `${res.total} match(es):\n${lines}\n\nNext: call strudel_get_example(id) to read the full code.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'strudel_get_example',
    {
      title: 'Get a Strudel example',
      description: 'Fetch the full code of one example tune by its id.',
      inputSchema: { id: z.string().describe('example id from strudel_search_examples') },
    },
    async ({ id }) => {
      const ex = await getExample(id);
      if (!ex) {
        return {
          content: [
            { type: 'text', text: `no example "${id}" — use strudel_search_examples to find ids.` },
          ],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(ex).slice(0, 4000) }] };
    },
  );

  server.registerTool(
    'strudel_list_sounds',
    {
      title: 'List playable sounds',
      description:
        "List the renderer's actual catalog — drum/texture samples, pitched soundfonts, synths. " +
        'Call this before composing so you pick names that exist.',
      inputSchema: {},
    },
    async () => {
      const sounds = await getSounds();
      return { content: [{ type: 'text', text: JSON.stringify(sounds).slice(0, 6000) }] };
    },
  );

  server.registerTool(
    'strudel_share_url',
    {
      title: 'strudel.cc share link',
      description: 'Build a playable strudel.cc editor link for Strudel code (no rendering).',
      inputSchema: { code: z.string().describe('Strudel code to share') },
    },
    ({ code }) => ({ content: [{ type: 'text', text: shareUrl(code) }] }),
  );

  // Resources are passive context for resource-aware clients; the prompt already
  // carries the guide for clients (the agents SDK) that ignore resources.
  server.registerResource(
    'guide',
    'strudel://guide',
    {
      title: 'Strudel composition guide',
      description: 'How to compose valid, structured Strudel.',
      mimeType: 'text/markdown',
    },
    () => ({ contents: [{ uri: 'strudel://guide', mimeType: 'text/markdown', text: GUIDE }] }),
  );

  server.registerResource(
    'sounds',
    'strudel://sounds',
    {
      title: 'Sound catalog',
      description: 'Playable samples, soundfonts, synths.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'strudel://sounds',
          mimeType: 'application/json',
          text: JSON.stringify(await getSounds()),
        },
      ],
    }),
  );

  server.registerResource(
    'example',
    new ResourceTemplate('strudel://example/{id}', {
      list: async () => {
        const res = await searchExamples({ limit: 100 });
        return {
          resources: res.results.map((r) => ({
            uri: `strudel://example/${r.id}`,
            name: r.title || r.id,
          })),
        };
      },
    }),
    {
      title: 'Example tune',
      description: 'Full code of a real Strudel tune by id.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      const ex = await getExample(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: ex ? JSON.stringify(ex) : `{"error":"no example ${id}"}`,
          },
        ],
      };
    },
  );

  return server;
}
