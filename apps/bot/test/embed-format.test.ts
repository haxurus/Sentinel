import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT_CATALOG } from '@sentinel/shared';
import {
  buildDetailsField,
  EMBED_LIMITS,
  escapeMarkdown,
  fitEmbed,
  formatAttachmentList,
  formatReference,
  normalizeColor,
  referenceKindForDetail,
  targetKindForEvent
} from '../src/embed-format.ts';
import { eventEmbedCopy } from '../src/embed-i18n.ts';

const guild = {
  id: '100000000000000001',
  name: 'Guild',
  members: { cache: new Map([['200000000000000002', { displayName: 'Ali*ce', user: { username: 'alice' } }]]) },
  roles: { cache: new Map([['300000000000000003', { name: 'Mods' }]]) },
  channels: { cache: new Map([['400000000000000004', { name: 'general' }]]) }
};

const total = (embed: ReturnType<typeof fitEmbed>) =>
  embed.title.length + embed.description.length + (embed.footer?.length ?? 0) +
  embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

test('fitEmbed keeps oversized logs within Discord limits', () => {
  const fitted = fitEmbed({
    title: 'T'.repeat(400),
    description: 'D'.repeat(5000),
    footer: 'F'.repeat(3000),
    fields: Array.from({ length: 30 }, (_, index) => ({ name: `Field ${index}`, value: 'V'.repeat(2000) }))
  });
  assert.ok(fitted.title.length <= EMBED_LIMITS.title);
  assert.ok(fitted.description.length <= EMBED_LIMITS.description);
  assert.ok((fitted.footer?.length ?? 0) <= EMBED_LIMITS.footer);
  assert.ok(fitted.fields.length <= EMBED_LIMITS.fields);
  assert.ok(fitted.fields.every((field) => field.value.length > 0 && field.value.length <= EMBED_LIMITS.fieldValue));
  assert.ok(total(fitted) <= EMBED_LIMITS.total, `total ${total(fitted)}`);
});

test('fitEmbed drops an empty footer and keeps small embeds untouched', () => {
  const fitted = fitEmbed({ title: 'Ban', description: 'x', footer: '  ', fields: [{ name: 'A', value: 'b' }] });
  assert.equal(fitted.footer, null);
  assert.deepEqual(fitted.fields, [{ name: 'A', value: 'b' }]);
});

test('formatReference escapes user-controlled names', () => {
  const rendered = formatReference(guild, 'user', '200000000000000002');
  assert.match(rendered, /\*\*Ali\\\*ce\*\*/);
  assert.match(rendered, /<@200000000000000002>/);
  assert.equal(formatReference(guild, 'user', 'not-an-id'), '`not-an-id`');
});

test('referenceKindForDetail classifies detail keys', () => {
  assert.equal(referenceKindForDetail('addedRoles'), 'role');
  assert.equal(referenceKindForDetail('actorRoleIds'), 'role');
  assert.equal(referenceKindForDetail('newOwnerId'), 'user');
  assert.equal(referenceKindForDetail('oldAfkChannelId'), 'channel');
  assert.equal(referenceKindForDetail('emoji'), null);
});

test('message.delete targets render as users', () => {
  assert.equal(targetKindForEvent('message.delete'), 'user');
  assert.equal(targetKindForEvent('role.update'), 'role');
  assert.equal(targetKindForEvent('raw.gateway'), 'technical');
});

test('buildDetailsField never exceeds a field value', () => {
  const details: Record<string, unknown> = {};
  for (let index = 0; index < 50; index += 1) details[`key${index}`] = 'x'.repeat(100);
  const field = buildDetailsField(guild, details, 'en');
  assert.ok(field && field.length <= 1024);
  assert.equal(buildDetailsField(guild, { content: 'hidden', actorBot: true }, 'en'), null);
});

test('formatAttachmentList refuses non-https links', () => {
  const [safe, unsafe] = formatAttachmentList([
    { name: 'a.png', url: 'https://cdn.discordapp.com/a.png' },
    { name: 'b](javascript:x)', url: 'javascript:alert(1)' }
  ], 'en');
  assert.equal(safe, '[a.png](https://cdn.discordapp.com/a.png)');
  assert.equal(unsafe, escapeMarkdown('b](javascript:x)'));
});

test('normalizeColor falls back on invalid input', () => {
  assert.equal(normalizeColor('#ff0000'), 0xff0000);
  assert.equal(normalizeColor('nope'), 0x3f3c54);
});

test('every catalog event has an English embed copy', () => {
  for (const event of EVENT_CATALOG) {
    assert.notEqual(eventEmbedCopy(event.key, 'en', event.label, event.description).description, 'Discord event.', event.key);
  }
});

test('event catalog keys are unique', () => {
  const keys = EVENT_CATALOG.map((event) => event.key);
  assert.equal(new Set(keys).size, keys.length);
});
