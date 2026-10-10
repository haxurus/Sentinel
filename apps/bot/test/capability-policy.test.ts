import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordCapabilityViolation, evaluateDiscordCapability, installDiscordCapabilityPolicy } from '../src/capability-policy.ts';

test('only reads, log messages and guild leave are allowed', () => {
  assert.equal(evaluateDiscordCapability('GET', '/guilds/123456789012345678/audit-logs').capability, 'read');
  assert.equal(evaluateDiscordCapability('post', 'https://discord.com/api/v10/channels/123456789012345678/messages?x=1').capability, 'send-log-message');
  assert.equal(evaluateDiscordCapability('DELETE', '/users/@me/guilds/123456789012345678').capability, 'leave-guild');
  assert.throws(() => evaluateDiscordCapability('PUT', '/guilds/123456789012345678/bans/234567890123456789'), DiscordCapabilityViolation);
  assert.throws(() => evaluateDiscordCapability('POST', '/channels/123456789012345678/messages/bulk-delete'), DiscordCapabilityViolation);
  assert.throws(() => evaluateDiscordCapability('DELETE', '/users/@me/guilds/123456789012345678/extra'), DiscordCapabilityViolation);
});

test('the bot may only edit its own cosmetic profile fields', () => {
  const route = '/guilds/123456789012345678/members/@me';
  assert.equal(evaluateDiscordCapability('PATCH', route, { nick: 'Audit', banner: null }).capability, 'edit-own-profile');
  assert.equal(evaluateDiscordCapability('PATCH', route).capability, 'edit-own-profile');
  for (const body of [{ roles: [] }, { nick: 'x', mute: true }, { communication_disabled_until: null }, 'nick=x', null, []]) {
    assert.throws(() => evaluateDiscordCapability('PATCH', route, body), DiscordCapabilityViolation);
  }
  assert.throws(() => evaluateDiscordCapability('PATCH', '/guilds/123456789012345678/members/234567890123456789', { nick: 'x' }), DiscordCapabilityViolation);
  assert.throws(() => evaluateDiscordCapability('PUT', route, { nick: 'x' }), DiscordCapabilityViolation);
});

test('installed policy guards every REST entry point', async () => {
  const calls: string[] = [];
  const rest: Record<string, (...args: any[]) => unknown> = {
    request: (options: any) => { calls.push(`request ${options.method} ${options.fullRoute}`); return 'ok'; },
    queueRequest: (options: any) => { calls.push(`queue ${options.method} ${options.fullRoute}`); return 'ok'; },
    post: (route: string) => { calls.push(`post ${route}`); return 'ok'; },
    put: (route: string) => { calls.push(`put ${route}`); return 'ok'; },
    patch: (route: string) => { calls.push(`patch ${route}`); return 'ok'; },
    delete: (route: string) => { calls.push(`delete ${route}`); return 'ok'; }
  };
  const blocked: string[] = [];
  installDiscordCapabilityPolicy({ rest } as any, ({ method, route }) => blocked.push(`${method} ${route}`));
  installDiscordCapabilityPolicy({ rest } as any); // idempotent

  assert.equal(rest.request!({ method: 'GET', fullRoute: '/guilds/123456789012345678' }), 'ok');
  assert.equal(rest.post!('/channels/123456789012345678/messages'), 'ok');
  assert.throws(() => rest.queueRequest!({ method: 'PATCH', fullRoute: '/guilds/123456789012345678/members/234567890123456789' }), DiscordCapabilityViolation);
  assert.throws(() => rest.put!('/guilds/123456789012345678/bans/234567890123456789'), DiscordCapabilityViolation);
  assert.throws(() => rest.delete!('/channels/123456789012345678/messages/234567890123456789'), DiscordCapabilityViolation);
  assert.throws(() => rest.patch!('/channels/123456789012345678'), DiscordCapabilityViolation);
  assert.throws(() => rest.patch!('/guilds/123456789012345678/members/@me', { body: { roles: [] } }), DiscordCapabilityViolation);
  assert.equal(rest.patch!('/guilds/123456789012345678/members/@me', { body: { nick: 'Audit' } }), 'ok');

  assert.deepEqual(calls, ['request GET /guilds/123456789012345678', 'post /channels/123456789012345678/messages', 'patch /guilds/123456789012345678/members/@me']);
  assert.equal(blocked.length, 5);
});
