import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVENT_CATALOG,
  PLANS,
  couponProblem,
  discountedPriceCents,
  effectiveTier,
  planLimits,
  requiredTierForEvent,
  tierAllows,
  type CouponLike
} from '@sentinel/shared';
import { canManageGuild, filterEntryCount, logChannelSet, planAdjustments, publicGuildSettings, trimFilters, type PlanRoute } from '../src/plan-rules.ts';

const route = (eventKey: string, patch: Partial<PlanRoute> = {}): PlanRoute => ({
  eventKey,
  captureEnabled: true,
  enabled: true,
  destinationChannelId: null,
  retentionDays: null,
  ignoredUserIds: [],
  ignoredRoleIds: [],
  ignoredChannelIds: [],
  mentionRoleIds: [],
  ...patch
});

const settings = {
  defaultLogChannelId: '100000000000000001',
  defaultRetentionDays: 30,
  presenceLoggingEnabled: false,
  typingLoggingEnabled: false,
  rawGatewayEnabled: false
};

test('every high-volume logger needs a paid plan and limits grow with the tier', () => {
  for (const event of EVENT_CATALOG) {
    const required = requiredTierForEvent(event);
    if (event.noisy) assert.notEqual(required, 'FREE', event.key);
    else assert.equal(required, 'FREE', event.key);
  }
  assert.equal(requiredTierForEvent({ key: 'message.create', noisy: true }), 'TIER1');
  assert.equal(requiredTierForEvent({ key: 'presence.update', noisy: true }), 'TIER2');
  assert.ok(!EVENT_CATALOG.some((event) => event.key.startsWith('system.')), 'bot status is instance-wide, not per server');

  const order = ['FREE', 'TIER1', 'TIER2', 'TIER3'] as const;
  for (let index = 1; index < order.length; index += 1) {
    const lower = planLimits(order[index - 1]!);
    const higher = planLimits(order[index]!);
    for (const key of Object.keys(lower) as Array<keyof typeof lower>) assert.ok(higher[key] >= lower[key], `${order[index]} ${key}`);
  }
  assert.ok(PLANS.TIER3.customBranding && !PLANS.TIER2.customBranding);
  assert.ok(tierAllows('TIER3', 'TIER2') && !tierAllows('TIER1', 'TIER2'));
});

test('expired plans fall back to Free', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(effectiveTier({ planTier: 'TIER2', planExpiresAt: null }, now), 'TIER2');
  assert.equal(effectiveTier({ planTier: 'TIER2', planExpiresAt: '2026-10-11T00:00:00Z' }, now), 'TIER2');
  assert.equal(effectiveTier({ planTier: 'TIER2', planExpiresAt: '2026-10-10T11:59:59Z' }, now), 'FREE');
  assert.equal(effectiveTier({ planTier: 'GOLD', planExpiresAt: null }, now), 'FREE');
});

test('coupons validate scope, dates and redemptions', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const coupon: CouponLike = { code: 'BETA', percentOff: 50, amountOffCents: null, tiers: ['TIER1'], billing: 'YEARLY', maxRedemptions: 2, redemptions: 0, validFrom: null, validUntil: '2026-12-31T00:00:00Z', active: true };
  assert.equal(couponProblem(coupon, 'TIER1', 'YEARLY', now), null);
  assert.equal(couponProblem(coupon, 'TIER2', 'YEARLY', now), 'COUPON_WRONG_TIER');
  assert.equal(couponProblem(coupon, 'TIER1', 'MONTHLY', now), 'COUPON_WRONG_BILLING');
  assert.equal(couponProblem({ ...coupon, redemptions: 2 }, 'TIER1', 'YEARLY', now), 'COUPON_EXHAUSTED');
  assert.equal(couponProblem({ ...coupon, validUntil: '2026-01-01T00:00:00Z' }, 'TIER1', 'YEARLY', now), 'COUPON_EXPIRED');
  assert.equal(couponProblem({ ...coupon, active: false }, 'TIER1', 'YEARLY', now), 'COUPON_INACTIVE');
  assert.equal(couponProblem(coupon, 'FREE', null, now), 'COUPON_FREE_PLAN');
  assert.equal(discountedPriceCents(2000, coupon), 1000);
  assert.equal(discountedPriceCents(200, { percentOff: null, amountOffCents: 500 }), 0);
});

test('a downgrade switches off loggers above the plan and clamps limits', () => {
  const routes = [
    route('message.create'),
    route('presence.update'),
    route('moderation.ban', { retentionDays: 365, mentionRoleIds: ['1', '2', '3'] }),
    route('message.delete', { ignoredUserIds: Array.from({ length: 12 }, (_, i) => `u${i}`), ignoredRoleIds: ['r1', 'r2', 'r3', 'r4', 'r5'] }),
    route('channel.create', { destinationChannelId: '200000000000000001' }),
    route('channel.delete', { destinationChannelId: '200000000000000002' }),
    route('channel.update', { destinationChannelId: '200000000000000003' }),
    route('role.create', { destinationChannelId: '200000000000000001' })
  ];
  const result = planAdjustments('FREE', { ...settings, defaultRetentionDays: 200, presenceLoggingEnabled: true }, routes);
  assert.deepEqual(result.settings, { defaultRetentionDays: 30, presenceLoggingEnabled: false });

  const patch = (key: string) => result.routes.find((item) => item.eventKey === key)?.data;
  assert.deepEqual(patch('message.create'), { captureEnabled: false, enabled: false });
  assert.deepEqual(patch('presence.update'), { captureEnabled: false, enabled: false });
  assert.deepEqual(patch('moderation.ban'), { retentionDays: 30, mentionRoleIds: ['1'] });
  assert.equal(filterEntryCount(patch('message.delete') as PlanRoute), 15);
  // Free allows 3 channels: the default one plus the first two distinct ones.
  assert.equal(patch('channel.create'), undefined);
  assert.equal(patch('channel.delete'), undefined);
  assert.deepEqual(patch('channel.update'), { destinationChannelId: null });
  assert.equal(patch('role.create'), undefined);

  assert.deepEqual(planAdjustments('TIER2', settings, [route('presence.update')]).routes, []);
});

test('plan helpers', () => {
  assert.equal(logChannelSet('1', [{ destinationChannelId: '1' }, { destinationChannelId: '2' }, { destinationChannelId: null }]).size, 2);
  assert.deepEqual(trimFilters({ ignoredUserIds: ['a', 'b'], ignoredRoleIds: ['c', 'd'], ignoredChannelIds: ['e'] }, 3), { ignoredUserIds: ['a', 'b'], ignoredRoleIds: ['c'], ignoredChannelIds: [] });
  assert.ok(canManageGuild({ owner: true, permissions: '0' }));
  assert.ok(canManageGuild({ owner: false, permissions: '32' }));
  assert.ok(canManageGuild({ owner: false, permissions: '8' }));
  assert.ok(!canManageGuild({ owner: false, permissions: '1024' }));
  assert.ok(!canManageGuild({ owner: false, permissions: 'nope' }));
  assert.deepEqual(publicGuildSettings({ guildId: 'x', planNote: 'paid by bank transfer', planCouponCode: 'BETA' }), { guildId: 'x' });
});
