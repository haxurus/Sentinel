import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

// security.ts loads the key at import time: configure it before importing.
process.env.LOG_DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
delete process.env.LOG_DATA_ENCRYPTION_KEY_FILE;
const security = await import('../src/security.ts');
const utils = await import('../src/utils.ts');

test('encryption round-trips and uses a fresh IV per record', () => {
  const first = security.encryptText('secret message')!;
  const second = security.encryptText('secret message')!;
  assert.ok(first.startsWith('enc:v1:'));
  assert.notEqual(first, second);
  assert.equal(security.decryptText(first), 'secret message');
  assert.equal(security.decryptText(null), null);
});

test('tampered ciphertext is rejected', () => {
  const value = security.encryptText('payload')!;
  const [iv, tag, data] = value.slice('enc:v1:'.length).split('.');
  const flipped = Buffer.from(data!, 'base64url');
  flipped[0] = flipped[0]! ^ 1;
  assert.throws(() => security.decryptText(`enc:v1:${iv}.${tag}.${flipped.toString('base64url')}`));
});

test('protectJson hides details and unprotectJson restores them', () => {
  const protectedValue = security.protectJson({ content: 'hello', nested: [1, 2] });
  assert.ok(!JSON.stringify(protectedValue).includes('hello'));
  assert.deepEqual(security.unprotectJson(protectedValue), { content: 'hello', nested: [1, 2] });
  assert.deepEqual(security.unprotectJson({ plain: true }), { plain: true });
});

test('redaction removes tokens from text and object keys', () => {
  const token = `${'A'.repeat(24)}.${'B'.repeat(6)}.${'C'.repeat(27)}`;
  assert.ok(!security.redactText(`Bot ${token}`).includes(token));
  assert.equal(security.redactText('https://x/?token=abc&ok=1'), 'https://x/?token=[REDACTED]&ok=1');
  assert.deepEqual(utils.redactSecrets({ token: 'abc', webhook_token: 'def', nested: { access_token: 'ghi', keep: 'yes' } }), {
    token: '[REDACTED]',
    webhook_token: '[REDACTED]',
    nested: { access_token: '[REDACTED]', keep: 'yes' }
  });
});

test('jsonSafe serialises bigint values', () => {
  assert.deepEqual(utils.jsonSafe({ permissions: 8n }), { permissions: '8' });
});

test('redaction finds a token inside a long word without rescanning it', () => {
  const token = `${'A'.repeat(24)}.${'B'.repeat(6)}.${'C'.repeat(27)}`;
  assert.equal(security.redactText(`x ${token}!`), 'x [REDACTED_TOKEN]!');
  // 60 000 unbroken characters took seconds before the pattern was anchored.
  const started = performance.now();
  assert.equal(security.redactText('a'.repeat(60_000)).length, 60_000);
  assert.ok(performance.now() - started < 1_000);
});

test('redactSecrets keeps dates so they are stored as timestamps', () => {
  const details = utils.jsonSafe(utils.redactSecrets({ accountCreatedAt: new Date(0) }));
  assert.deepEqual(details, { accountCreatedAt: '1970-01-01T00:00:00.000Z' });
});

const auditGuild = (entries: unknown[], me: unknown = null) => {
  let fetched = 0;
  const guild = { members: { me }, fetchAuditLogs: async () => { fetched += 1; return { entries }; } };
  return { guild: guild as never, fetched: () => fetched };
};

test('audit lookup matches invites by code and other targets by raw ID', async () => {
  const now = Date.now();
  const { guild } = auditGuild([
    { executorId: '1', targetId: null, target: { code: 'abc123' }, createdTimestamp: now },
    { executorId: '2', targetId: '300000000000000003', target: { soundId: '300000000000000003' }, createdTimestamp: now }
  ]);
  assert.equal((await utils.findRecentAuditEntry(guild, 42, 'abc123'))?.executorId, '1');
  assert.equal((await utils.findRecentAuditEntry(guild, 131, '300000000000000003'))?.executorId, '2');
  assert.equal(await utils.findRecentAuditEntry(guild, 42, 'other'), null);
});

test('audit lookup is skipped when the bot cannot view the Audit Log', async () => {
  const denied = auditGuild([], { partial: false, permissions: { has: () => false } });
  assert.equal(await utils.findRecentAuditEntry(denied.guild, 20), null);
  assert.equal(denied.fetched(), 0);
  // The installer lookup (BotAdd = 28) is always attempted.
  await utils.findRecentAuditEntry(denied.guild, 28);
  assert.equal(denied.fetched(), 1);
  const allowed = auditGuild([], { partial: false, permissions: { has: () => true } });
  await utils.findRecentAuditEntry(allowed.guild, 20);
  assert.equal(allowed.fetched(), 1);
});
