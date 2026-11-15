import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

// config.ts and security.ts read these at import time. Nothing connects to
// Redis or the database: only the HTTP server and pure helpers are used.
process.env.LOG_DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
delete process.env.LOG_DATA_ENCRYPTION_KEY_FILE;
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.BOT_INTERNAL_API_KEY = 'k'.repeat(48);
process.env.DISCORD_TOKEN = 'test';
process.env.LOG_LEVEL = 'fatal';
const { startInternalApi } = await import('../src/internal-api.ts');
const { canPostEmbeds } = await import('../src/dispatcher.ts');

const secret = process.env.BOT_INTERNAL_API_KEY;
const guilds = new Map<string, unknown>([
  ['100000000000000001', { id: '100000000000000001', name: 'Zeta', ownerId: '1', memberCount: 3, members: { cache: new Map() }, iconURL: () => null }],
  // Unavailable since startup: Discord has not sent its data yet.
  ['100000000000000002', { id: '100000000000000002', members: { cache: new Map() }, iconURL: () => null }]
]);
const server = startInternalApi({ isReady: () => true, guilds: { cache: guilds } } as never, secret, 0);
await new Promise((resolve) => server.once('listening', resolve));
after(() => server.close());

const call = (path: string, authorization: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const request = http.get({ port: (server.address() as AddressInfo).port, path, headers: { authorization }, timeout: 2_000 }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
  });
  request.on('timeout', () => request.destroy(new Error('no response')));
  request.on('error', reject);
});

test('internal API rejects a wrong key, also one with non-ASCII characters', async () => {
  assert.equal((await call('/guilds', `Bearer ${'x'.repeat(48)}`)).status, 401);
  // Same character length as the real header, more bytes once encoded.
  assert.equal((await call('/guilds', `Bearer ${'é'.repeat(48)}`)).status, 401);
});

test('internal API lists servers that are still unavailable', async () => {
  const response = await call('/guilds', `Bearer ${secret}`);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body).map((guild: { name: string }) => guild.name), ['100000000000000002', 'Zeta']);
});

test('canPostEmbeds refuses only a channel the bot is known to be locked out of', () => {
  const me = { partial: false } as never;
  const channel = (thread: boolean, ...flags: bigint[]) => ({ isThread: () => thread, permissionsFor: () => new PermissionsBitField(flags) });
  const { ViewChannel, EmbedLinks, SendMessages, SendMessagesInThreads } = PermissionFlagsBits;
  assert.equal(canPostEmbeds(channel(false, ViewChannel, EmbedLinks, SendMessages), me), true);
  assert.equal(canPostEmbeds(channel(false, ViewChannel, SendMessages), me), false);
  assert.equal(canPostEmbeds(channel(true, ViewChannel, EmbedLinks, SendMessages), me), false);
  assert.equal(canPostEmbeds(channel(true, ViewChannel, EmbedLinks, SendMessagesInThreads), me), true);
  // Unknown permissions (own member or parent channel not cached): let Discord decide.
  assert.equal(canPostEmbeds(channel(false), null), true);
  assert.equal(canPostEmbeds({ isThread: () => true, permissionsFor: () => null }, me), true);
});
