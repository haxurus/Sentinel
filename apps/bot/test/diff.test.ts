import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  guildChanges,
  isAuthorEdit,
  permissionOverwriteChanges,
  roleChanges,
  sameAttachments,
  threadChanges
} from '../src/diff.ts';

const permissions = (...names: string[]) => ({ toArray: () => names });

const role = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mod',
  hexColor: '#ff0000',
  hoist: false,
  mentionable: false,
  icon: null,
  unicodeEmoji: null,
  position: 3,
  permissions: permissions('KickMembers'),
  ...overrides
});

test('roleChanges ignores position-only updates', () => {
  assert.deepEqual(roleChanges(role(), role({ position: 7 })), {});
});

test('roleChanges reports added and removed permissions by name', () => {
  const details = roleChanges(role(), role({ permissions: permissions('BanMembers') }));
  assert.deepEqual(details.addedPermissions, ['BanMembers']);
  assert.deepEqual(details.removedPermissions, ['KickMembers']);
});

test('roleChanges reports renames', () => {
  const details = roleChanges(role(), role({ name: 'Moderator' }));
  assert.equal(details.oldName, 'Mod');
  assert.equal(details.newName, 'Moderator');
});

test('threadChanges ignores unchanged threads', () => {
  const thread = { name: 'a', archived: false, locked: false, autoArchiveDuration: 1440, rateLimitPerUser: 0, invitable: null, appliedTags: [] };
  assert.deepEqual(threadChanges(thread, { ...thread, memberCount: 12 }), {});
  assert.deepEqual(threadChanges(thread, { ...thread, archived: true }), { oldArchived: false, newArchived: true });
});

test('guildChanges only reports tracked fields that changed', () => {
  const guild = { name: 'Server', verificationLevel: 1, iconURL: () => null, bannerURL: () => null, splashURL: () => null, memberCount: 10 };
  assert.deepEqual(guildChanges(guild, { ...guild, memberCount: 11 }), {});
  assert.deepEqual(guildChanges(guild, { ...guild, verificationLevel: 3 }), { oldVerificationLevel: 1, newVerificationLevel: 3 });
});

test('permissionOverwriteChanges diffs allow/deny sets', () => {
  const overwrite = (allow: string[], deny: string[]) => ({ type: 0, allow: permissions(...allow), deny: permissions(...deny) });
  const before = { permissionOverwrites: { cache: new Map([['1', overwrite(['ViewChannel'], [])]]) } };
  const after = { permissionOverwrites: { cache: new Map([['1', overwrite([], ['ViewChannel'])]]) } };
  assert.deepEqual(permissionOverwriteChanges(before, after), [{
    targetId: '1', targetType: 'role', action: 'updated',
    allowAdded: [], allowRemoved: ['ViewChannel'], denyAdded: ['ViewChannel'], denyRemoved: []
  }]);
  assert.deepEqual(permissionOverwriteChanges(before, before), []);
});

test('isAuthorEdit ignores embed resolution and pins', () => {
  assert.equal(isAuthorEdit({ partial: false, editedTimestamp: null }, { editedTimestamp: null }), false);
  assert.equal(isAuthorEdit({ partial: false, editedTimestamp: 1000 }, { editedTimestamp: 1000 }), false);
  assert.equal(isAuthorEdit({ partial: false, editedTimestamp: null }, { editedTimestamp: 2000 }), true);
  assert.equal(isAuthorEdit({ partial: true, editedTimestamp: null }, { editedTimestamp: 2000 }), true);
});

test('sameAttachments compares ids, not signed CDN URLs', () => {
  const before = [{ id: '1', url: 'https://cdn.discordapp.com/a?ex=1', proxyURL: 'x' }];
  const after = [{ id: '1', url: 'https://cdn.discordapp.com/a?ex=2' }];
  assert.equal(sameAttachments(before, after), true);
  assert.equal(sameAttachments(before, []), false);
});
