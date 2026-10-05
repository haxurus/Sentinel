import type { Client } from 'discord.js';

export type DiscordCapabilityDecision = {
  method: string;
  route: string;
  capability: 'read' | 'send-log-message' | 'leave-guild';
};

export class DiscordCapabilityViolation extends Error {
  readonly code = 'DISCORD_CAPABILITY_BLOCKED';
  readonly method: string;
  readonly route: string;

  constructor(method: string, route: string) {
    super(`Discord mutation blocked by Sentinel capability policy: ${method} ${route || '<unknown>'}`);
    this.name = 'DiscordCapabilityViolation';
    this.method = method;
    this.route = route;
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CHANNEL_MESSAGE_ROUTE = /^\/channels\/\d{17,20}\/messages$/;
const LEAVE_GUILD_ROUTE = /^\/users\/@me\/guilds\/\d{17,20}$/;

function normalizeMethod(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeDiscordRoute(value: unknown) {
  let route = String(value ?? '').trim();
  if (!route) return '';

  if (/^https?:\/\//i.test(route)) {
    try {
      route = new URL(route).pathname;
    } catch {
      return route;
    }
  }

  route = route.split('?')[0] ?? route;
  route = route.replace(/^\/api(?:\/v\d+)?(?=\/)/, '');
  return route;
}

export function evaluateDiscordCapability(methodValue: unknown, routeValue: unknown): DiscordCapabilityDecision {
  const method = normalizeMethod(methodValue);
  const route = normalizeDiscordRoute(routeValue);

  if (READ_METHODS.has(method)) return { method, route, capability: 'read' };

  if (method === 'POST' && CHANNEL_MESSAGE_ROUTE.test(route)) {
    return { method, route, capability: 'send-log-message' };
  }

  if (method === 'DELETE' && LEAVE_GUILD_ROUTE.test(route)) {
    return { method, route, capability: 'leave-guild' };
  }

  throw new DiscordCapabilityViolation(method || '<unknown>', route);
}

type BlockedReporter = (details: { method: string; route: string; error: DiscordCapabilityViolation }) => void;

const policyMarker = Symbol.for('sentinel.discord-capability-policy');

export function installDiscordCapabilityPolicy(client: Client, onBlocked?: BlockedReporter) {
  const rest = client.rest as any;
  if (rest[policyMarker]) return;
  Object.defineProperty(rest, policyMarker, { value: true, configurable: false, enumerable: false });

  const check = (method: unknown, route: unknown) => {
    try {
      return evaluateDiscordCapability(method, route);
    } catch (error) {
      const violation = error instanceof DiscordCapabilityViolation
        ? error
        : new DiscordCapabilityViolation(String(method ?? ''), normalizeDiscordRoute(route));
      onBlocked?.({ method: violation.method, route: violation.route, error: violation });
      throw violation;
    }
  };

  // Guard the generic request methods used by @discordjs/rest. request() is
  // the public entry point; queueRequest() is the lower-level one it delegates
  // to and is wrapped too so no code path can reach the network unchecked.
  for (const methodName of ['request', 'queueRequest'] as const) {
    if (typeof rest[methodName] !== 'function') continue;
    const original = rest[methodName].bind(rest);
    rest[methodName] = (options: any) => {
      check(options?.method ?? 'GET', options?.fullRoute ?? options?.route ?? '');
      return original(options);
    };
  }

  // Guard public mutation helpers as well. This is intentionally redundant:
  // even if a future discord.js version bypasses request(), writes still pass
  // through an allowlisted method+route check.
  for (const methodName of ['post', 'put', 'patch', 'delete'] as const) {
    if (typeof rest[methodName] !== 'function') continue;
    const original = rest[methodName].bind(rest);
    rest[methodName] = (route: unknown, options?: unknown) => {
      check(methodName.toUpperCase(), route);
      return original(route, options);
    };
  }
}
