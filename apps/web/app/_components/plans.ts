import type { Locale } from '../i18n';

/** Shapes returned by the API (the plan catalogue lives in @sentinel/shared). */
export type PlanTier = 'FREE' | 'TIER1' | 'TIER2' | 'TIER3';
export type PlanLimits = {
  retentionDays: number;
  eventsPerDay: number;
  logChannels: number;
  filterEntries: number;
  mentionRoles: number;
  roleBindings: number;
  exportEvents: number;
};
export type Plan = {
  tier: PlanTier;
  name: string;
  level: number;
  monthlyCents: number;
  yearlyCents: number;
  limits: PlanLimits;
  prioritySupport: boolean;
  customBranding: boolean;
};
export type Promotion = {
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  tiers: string[];
  billing: string;
  validUntil: string | null;
};
export type Contacts = { email: string | null; discord: string | null; url: string | null };
export type PublicInfo = {
  waitlistOpen: boolean;
  contacts: Contacts;
  plans: Plan[];
  eventTiers: { TIER1: string[]; TIER2: string[] };
  promotions: Promotion[];
};

export const TIER_ORDER: PlanTier[] = ['FREE', 'TIER1', 'TIER2', 'TIER3'];

export function tierLabel(tier: string, locale: Locale) {
  switch (tier) {
    case 'TIER1': return locale === 'it' ? 'Livello 1 · Plus' : 'Level 1 · Plus';
    case 'TIER2': return locale === 'it' ? 'Livello 2 · Pro' : 'Level 2 · Pro';
    case 'TIER3': return locale === 'it' ? 'Livello 3 · Brand' : 'Level 3 · Brand';
    default: return 'Free';
  }
}

export const tierShort = (tier: string) => ({ TIER1: 'Plus', TIER2: 'Pro', TIER3: 'Brand' } as Record<string, string>)[tier] ?? 'Free';

export function formatPrice(cents: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

export const formatNumber = (value: number, locale: Locale) => value.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US');

export function promotionText(promo: Promotion, locale: Locale) {
  const amount = promo.percentOff ? `-${promo.percentOff}%` : `-${formatPrice(promo.amountOffCents ?? 0, locale)}`;
  const scope = promo.tiers.length ? promo.tiers.map(tierShort).join(', ') : (locale === 'it' ? 'tutti i piani' : 'every plan');
  const billing = promo.billing === 'MONTHLY' ? (locale === 'it' ? 'mensile' : 'monthly') : promo.billing === 'YEARLY' ? (locale === 'it' ? 'annuale' : 'yearly') : '';
  return { amount, scope: billing ? `${scope} · ${billing}` : scope };
}

export function limitLabels(locale: Locale): Record<keyof PlanLimits, string> {
  return locale === 'it'
    ? {
        retentionDays: 'Conservazione massima',
        eventsPerDay: 'Eventi registrati al giorno',
        logChannels: 'Canali di log',
        filterEntries: 'Filtri per logger',
        mentionRoles: 'Ruoli menzionati per logger',
        roleBindings: 'Ruoli con accesso al pannello',
        exportEvents: 'Eventi per export JSON'
      }
    : {
        retentionDays: 'Maximum retention',
        eventsPerDay: 'Events stored per day',
        logChannels: 'Log channels',
        filterEntries: 'Filters per logger',
        mentionRoles: 'Mentioned roles per logger',
        roleBindings: 'Roles with panel access',
        exportEvents: 'Events per JSON export'
      };
}

export function formatLimit(key: keyof PlanLimits, value: number, locale: Locale) {
  if (key === 'retentionDays') return locale === 'it' ? `${value} giorni` : `${value} days`;
  return formatNumber(value, locale);
}

/** API error codes shared by the dashboards. */
export function planErrorMessage(body: { error?: string; limit?: string; max?: number; required?: string }, locale: Locale) {
  const it = locale === 'it';
  if (body.error === 'PLAN_REQUIRED') {
    return it ? `Questa funzione richiede il piano ${tierLabel(body.required ?? 'TIER1', locale)}.` : `This feature requires the ${tierLabel(body.required ?? 'TIER1', locale)} plan.`;
  }
  if (body.error === 'PLAN_LIMIT' && body.limit) {
    const label = limitLabels(locale)[body.limit as keyof PlanLimits] ?? body.limit;
    return it ? `Limite del piano raggiunto: ${label} (massimo ${body.max}).` : `Plan limit reached: ${label} (maximum ${body.max}).`;
  }
  return null;
}
