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
