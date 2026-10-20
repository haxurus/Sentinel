import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogBuffer } from '@sentinel/shared';

test('log buffer keeps the latest redacted lines, newest first, by level', () => {
  const buffer = createLogBuffer(3, (value) => value.replace(/secret-\w+/g, '[REDACTED]'));
  buffer.write(`${JSON.stringify({ level: 30, time: 1, msg: 'first', pid: 1, hostname: 'x' })}\n`);
  buffer.write(`${JSON.stringify({ level: 40, time: 2, msg: 'token secret-abc', guildId: '1' })}\n${JSON.stringify({ level: 50, time: 3, msg: 'boom', error: 'secret-def' })}\n`);
  buffer.write('not json');

  const all = buffer.list('trace', 10);
  assert.equal(all.length, 3, 'capacity is respected');
  assert.deepEqual(all.map((entry) => entry.msg), ['not json', 'boom', 'token [REDACTED]']);
  assert.deepEqual(all[1]!.context, { error: '[REDACTED]' });
  assert.equal(all[2]!.context?.guildId, '1');
  assert.equal(all[2]!.context?.pid, undefined, 'process noise is dropped');

  assert.deepEqual(buffer.list('warn', 10).map((entry) => entry.level), ['error', 'warn']);
  assert.equal(buffer.list('trace', 1).length, 1);
});
