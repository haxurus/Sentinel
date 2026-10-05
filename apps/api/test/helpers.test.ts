import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, exportJsonChunks, findForeignReference, isValidTimeZone, rateLimitKey } from '../src/helpers.ts';

test('authenticated requests are rate limited per session, not per proxy address', () => {
  const a = rateLimitKey({ ip: '172.20.0.5', cookies: { '__Host-audit_session': 'token-a' } });
  const b = rateLimitKey({ ip: '172.20.0.5', cookies: { '__Host-audit_session': 'token-b' } });
  assert.notEqual(a, b);
  assert.ok(a.startsWith('session:') && !a.includes('token-a'));
  assert.equal(rateLimitKey({ ip: '172.20.0.5', cookies: {} }), 'ip:172.20.0.5');
});

test('clientIp prefers a well-formed CF-Connecting-IP header', () => {
  assert.equal(clientIp({ ip: '172.20.0.5', headers: { 'cf-connecting-ip': '203.0.113.9' } }), '203.0.113.9');
  assert.equal(clientIp({ ip: '172.20.0.5', headers: { 'cf-connecting-ip': '2001:db8::1' } }), '2001:db8::1');
  assert.equal(clientIp({ ip: '172.20.0.5', headers: { 'cf-connecting-ip': 'evil value' } }), '172.20.0.5');
  assert.equal(clientIp({ ip: '172.20.0.5', headers: {} }), '172.20.0.5');
});

test('time zones are validated against the IANA database', () => {
  assert.equal(isValidTimeZone('Europe/Rome'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
});

test('foreign channel and role references are rejected', () => {
  const resources = {
    channels: [{ id: '1', type: 0 }, { id: '2', type: 4 }],
    roles: [{ id: '10' }]
  };
  assert.equal(findForeignReference(resources, { sendableChannelIds: ['1', null], roleIds: ['10'] }), null);
  assert.equal(findForeignReference(resources, { sendableChannelIds: ['2'] }), '2', 'categories cannot receive logs');
  assert.equal(findForeignReference(resources, { sendableChannelIds: ['99'] }), '99');
  assert.equal(findForeignReference(resources, { channelIds: ['2'] }), null, 'any channel type can be ignored');
  assert.equal(findForeignReference(resources, { roleIds: ['11'] }), '11');
});

async function collect(stream: AsyncIterable<string>) {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

async function* pages<T>(...items: T[][]) {
  for (const page of items) yield page;
}

test('streamed export is valid JSON with decrypted rows and a count', async () => {
  const json = await collect(exportJsonChunks(
    { exportedAt: '2026-10-05T00:00:00.000Z', guildId: '1' },
    pages([{ id: 'a', details: 'x' }], [{ id: 'b', details: 'y' }]),
    (row) => ({ ...row, details: { value: row.details } })
  ));
  const parsed = JSON.parse(json);
  assert.equal(parsed.count, 2);
  assert.deepEqual(parsed.events, [{ id: 'a', details: { value: 'x' } }, { id: 'b', details: { value: 'y' } }]);

  const empty = JSON.parse(await collect(exportJsonChunks({ exportedAt: 'now', guildId: '1' }, pages(), (row) => row)));
  assert.deepEqual(empty.events, []);
  assert.equal(empty.count, 0);
});
