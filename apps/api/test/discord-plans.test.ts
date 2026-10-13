import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RENEWAL_GRACE_MS, decidePlan, parseSkus, plansFromEntitlements, storeLinks } from '../src/discord-plans.ts';

const now = new Date('2026-10-13T12:00:00Z');
const skus = parseSkus({
  TIER1: { MONTHLY: '100000000000000001', YEARLY: '100000000000000002' },
  TIER2: { MONTHLY: '100000000000000003' },
  TIER3: { MONTHLY: 'not-a-snowflake' },
  GOLD: { MONTHLY: '100000000000000009' }
});
const entitlement = (id: string, skuId: string, guildId: string | null, endsAt: string | null = '2026-11-13T12:00:00Z') =>
  ({ id, skuId, guildId, type: 8, startsAt: '2026-10-13T12:00:00Z', endsAt });

test('SKU configuration ignores unknown plans and invalid IDs', () => {
  assert.deepEqual(skus, {
    TIER1: { MONTHLY: '100000000000000001', YEARLY: '100000000000000002' },
    TIER2: { MONTHLY: '100000000000000003' }
  });
  assert.deepEqual(parseSkus(null), {});
  assert.deepEqual(parseSkus(['x']), {});
});

test('store links exist only for configured SKUs', () => {
  const store = storeLinks(skus, '900000000000000000');
  assert.equal(store.enabled, true);
  assert.equal(store.links.TIER1.YEARLY, 'https://discord.com/application-directory/900000000000000000/store/100000000000000002');
  assert.equal(store.links.TIER2.YEARLY, null);
  assert.equal(store.links.TIER3.MONTHLY, null);
  assert.equal(storeLinks({}, '900000000000000000').enabled, false);
});

test('each server gets its best active guild subscription', () => {
  const plans = plansFromEntitlements([
    entitlement('1', '100000000000000001', '500000000000000001'),
    entitlement('2', '100000000000000003', '500000000000000001'),
    entitlement('3', '100000000000000001', '500000000000000002', '2026-10-01T00:00:00Z'),
    entitlement('4', '100000000000000001', null),
    entitlement('5', '999999999999999999', '500000000000000003'),
    entitlement('6', '100000000000000002', '500000000000000004', null)
  ], skus, now);
  assert.deepEqual([...plans.keys()].sort(), ['500000000000000001', '500000000000000004']);
  const pro = plans.get('500000000000000001')!;
  assert.equal(pro.tier, 'TIER2');
  assert.equal(pro.entitlementId, '2');
  assert.equal(pro.expiresAt!.getTime(), new Date('2026-11-13T12:00:00Z').getTime() + RENEWAL_GRACE_MS);
  assert.deepEqual(plans.get('500000000000000004'), { tier: 'TIER1', billing: 'YEARLY', entitlementId: '6', expiresAt: null });
});

test('sync decisions', () => {
  const discord = { tier: 'TIER2' as const, billing: 'MONTHLY' as const, entitlementId: '2', expiresAt: new Date('2026-11-16T12:00:00Z') };
  const free = { planTier: 'FREE', planExpiresAt: null, planSource: 'MANUAL', planEntitlementId: null, planBilling: null };

  assert.deepEqual(decidePlan(free, discord, now), { kind: 'discord', plan: discord, downgrade: false });
  assert.deepEqual(decidePlan(free, undefined, now), { kind: 'keep' });

  const synced = { planTier: 'TIER2', planExpiresAt: discord.expiresAt, planSource: 'DISCORD', planEntitlementId: '2', planBilling: 'MONTHLY' };
  assert.deepEqual(decidePlan(synced, discord, now), { kind: 'keep' });
  assert.deepEqual(decidePlan(synced, undefined, now), { kind: 'ended' });
  const renewed = { ...discord, expiresAt: new Date('2026-12-16T12:00:00Z') };
  assert.equal(decidePlan(synced, renewed, now).kind, 'discord');
  const plus = { ...discord, tier: 'TIER1' as const, entitlementId: '7' };
  assert.deepEqual(decidePlan(synced, plus, now), { kind: 'discord', plan: plus, downgrade: true });

  // A running manual gift above the subscription wins; an expired one does not.
  const gift = { planTier: 'TIER3', planExpiresAt: new Date('2026-12-01T00:00:00Z'), planSource: 'MANUAL', planEntitlementId: null, planBilling: 'GIFT' };
  assert.deepEqual(decidePlan(gift, discord, now), { kind: 'keep' });
  assert.equal(decidePlan({ ...gift, planExpiresAt: new Date('2026-10-01T00:00:00Z') }, discord, now).kind, 'discord');
  assert.deepEqual(decidePlan(gift, undefined, now), { kind: 'keep' });
});
