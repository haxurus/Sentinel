import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ALERT_SETTINGS,
  digestDue,
  formatDuration,
  groupForDelivery,
  inQuietHours,
  parseAlertSettings,
  reminderDue,
  routeTarget
} from '../src/alert-rules.ts';

test('settings merge over the defaults and reject invalid values', () => {
  assert.deepEqual(parseAlertSettings(null), DEFAULT_ALERT_SETTINGS);
  const settings = parseAlertSettings({
    routes: {
      errors: { mode: 'channel', guildId: '100000000000000001', channelId: '200000000000000001', mention: true },
      usage: { mode: 'log' },
      billing: { mode: 'channel', guildId: 'x' },
      nope: { mode: 'status' }
    },
    quietHours: { enabled: true, start: '25:00', end: '07:30' },
    digest: { time: '18:00', mode: 'channel', guildId: '100000000000000001', channelId: '200000000000000002' },
    timezone: 'Mars/Olympus'
  });
  assert.deepEqual(settings.routes.errors, { mode: 'channel', guildId: '100000000000000001', channelId: '200000000000000001', mention: true });
  assert.equal(settings.routes.usage.mode, 'log');
  assert.deepEqual(settings.routes.billing, { mode: 'channel', guildId: null, channelId: null, mention: false });
  assert.equal(settings.routes.availability.mention, true);
  assert.deepEqual(settings.quietHours, { enabled: true, start: '23:00', end: '07:30' });
  assert.equal(settings.digest.channelId, '200000000000000002');
  assert.equal(settings.timezone, 'Europe/Rome');
});

test('routes resolve to a channel or to nothing', () => {
  const status = { guildId: '1', channelId: '2' };
  assert.deepEqual(routeTarget({ mode: 'status', guildId: null, channelId: null }, status), status);
  assert.equal(routeTarget({ mode: 'status', guildId: null, channelId: null }, null), null);
  assert.deepEqual(routeTarget({ mode: 'channel', guildId: '3', channelId: '4' }, status), { guildId: '3', channelId: '4' });
  assert.equal(routeTarget({ mode: 'digest', guildId: null, channelId: null }, status), null);
});

test('quiet hours cross midnight in the configured time zone', () => {
  const settings = { ...DEFAULT_ALERT_SETTINGS, quietHours: { enabled: true, start: '23:00', end: '08:00' } };
  // Rome is UTC+2 in October.
  assert.equal(inQuietHours(settings, new Date('2026-10-21T22:30:00Z')), true);
  assert.equal(inQuietHours(settings, new Date('2026-10-21T05:59:00Z')), true);
  assert.equal(inQuietHours(settings, new Date('2026-10-21T06:00:00Z')), false);
  assert.equal(inQuietHours(settings, new Date('2026-10-21T12:00:00Z')), false);
  assert.equal(inQuietHours({ ...settings, quietHours: { ...settings.quietHours, enabled: false } }, new Date('2026-10-21T22:30:00Z')), false);
});

test('the digest is due once per local day after its time', () => {
  const settings = DEFAULT_ALERT_SETTINGS; // 09:00 Europe/Rome
  assert.equal(digestDue(settings, new Date('2026-10-21T06:59:00Z'), null), false);
  assert.equal(digestDue(settings, new Date('2026-10-21T07:00:00Z'), null), true);
  assert.equal(digestDue(settings, new Date('2026-10-21T15:00:00Z'), new Date('2026-10-21T07:00:30Z')), false);
  assert.equal(digestDue(settings, new Date('2026-10-22T07:05:00Z'), new Date('2026-10-21T07:00:30Z')), true);
});

test('repeated alerts are grouped and held during the window', () => {
  const now = 1_000_000_000;
  const lastSent = new Map([['a', now - 60_000], ['b', now - 11 * 60_000]]);
  const groups = groupForDelivery([{ key: 'a', id: 1 }, { key: 'b', id: 2 }, { key: 'b', id: 3 }, { key: 'c', id: 4 }], lastSent, now);
  assert.deepEqual(groups.map((group) => [group.key, group.members.length]), [['b', 2], ['c', 1]]);
});

test('reminders after 15 minutes, 1 hour, then every 6 hours', () => {
  const openedAt = new Date('2026-10-21T10:00:00Z');
  const base = { severity: 'warning', openedAt, resolvedAt: null, acknowledgedAt: null, lastRemindedAt: null, reminders: 0 };
  assert.equal(reminderDue(base, new Date('2026-10-21T10:14:00Z')), false);
  assert.equal(reminderDue(base, new Date('2026-10-21T10:15:00Z')), true);
  assert.equal(reminderDue({ ...base, reminders: 1, lastRemindedAt: new Date('2026-10-21T10:15:00Z') }, new Date('2026-10-21T10:59:00Z')), false);
  assert.equal(reminderDue({ ...base, reminders: 1 }, new Date('2026-10-21T11:00:00Z')), true);
  assert.equal(reminderDue({ ...base, reminders: 2, lastRemindedAt: new Date('2026-10-21T11:00:00Z') }, new Date('2026-10-21T16:59:00Z')), false);
  assert.equal(reminderDue({ ...base, reminders: 2, lastRemindedAt: new Date('2026-10-21T11:00:00Z') }, new Date('2026-10-21T17:00:00Z')), true);
  assert.equal(reminderDue({ ...base, acknowledgedAt: openedAt }, new Date('2026-10-22T10:00:00Z')), false);
  assert.equal(reminderDue({ ...base, severity: 'info' }, new Date('2026-10-22T10:00:00Z')), false);
  assert.equal(formatDuration(90 * 60_000), '1 h 30 min');
});
