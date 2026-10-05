import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDiscordCapability } from './capability-policy.js';

const allowed: Array<[string, string]> = [
  ['GET', '/guilds/123456789012345678/channels'],
  ['GET', '/guilds/123456789012345678/audit-logs'],
  ['GET', '/guilds/123456789012345678/members/234567890123456789'],
  ['POST', '/channels/123456789012345678/messages'],
  ['DELETE', '/users/@me/guilds/123456789012345678']
];

const blocked: Array<[string, string]> = [
  ['PUT', '/guilds/123456789012345678/bans/234567890123456789'],
  ['DELETE', '/guilds/123456789012345678/bans/234567890123456789'],
  ['PATCH', '/guilds/123456789012345678/members/234567890123456789'],
  ['DELETE', '/guilds/123456789012345678/members/234567890123456789'],
  ['DELETE', '/channels/123456789012345678/messages/234567890123456789'],
  ['POST', '/channels/123456789012345678/messages/bulk-delete'],
  ['POST', '/guilds/123456789012345678/channels'],
  ['PATCH', '/channels/123456789012345678'],
  ['DELETE', '/channels/123456789012345678'],
  ['POST', '/guilds/123456789012345678/roles'],
  ['PATCH', '/guilds/123456789012345678/roles/234567890123456789'],
  ['DELETE', '/guilds/123456789012345678/roles/234567890123456789'],
  ['PUT', '/channels/123456789012345678/permissions/234567890123456789'],
  ['DELETE', '/channels/123456789012345678/permissions/234567890123456789'],
  ['PATCH', '/guilds/123456789012345678'],
  ['POST', '/channels/123456789012345678/webhooks'],
  ['PATCH', '/webhooks/123456789012345678/token'],
  ['DELETE', '/webhooks/123456789012345678/token'],
  ['POST', '/guilds/123456789012345678/auto-moderation/rules'],
  ['PATCH', '/guilds/123456789012345678/auto-moderation/rules/234567890123456789'],
  ['DELETE', '/guilds/123456789012345678/auto-moderation/rules/234567890123456789'],
  ['PUT', '/channels/123456789012345678/pins/234567890123456789'],
  ['POST', '/guilds/123456789012345678/invites'],
  ['POST', '/channels/123456789012345678/invites'],
  ['PUT', '/channels/123456789012345678/messages/234567890123456789/reactions/%F0%9F%91%8D/@me'],
  ['POST', '/channels/123456789012345678/messages/234567890123456789/crosspost'],
  ['POST', '/channels/123456789012345678/threads'],
  ['PATCH', '/channels/123456789012345678/messages/234567890123456789'],
  ['POST', '/interactions/123456789012345678/token/callback'],
  ['PATCH', '/users/@me'],
  ['DELETE', '/guilds/123456789012345678'],
  ['POST', '/api/v10/channels/123456789012345678/messages/bulk-delete'],
  ['', '/channels/123456789012345678/messages']
];

for (const [method, route] of allowed) {
  evaluateDiscordCapability(method, route);
}

for (const [method, route] of blocked) {
  let denied = false;
  try {
    evaluateDiscordCapability(method, route);
  } catch {
    denied = true;
  }
  if (!denied) throw new Error(`Capability policy unexpectedly allowed ${method} ${route}`);
}

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const excluded = new Set([
  'capability-policy.ts',
  'capability-policy-check.ts',
  'discord-actions.ts'
]);

const forbiddenSourcePatterns: Array<[string, RegExp]> = [
  ['direct discord.js REST mutation', /\.rest\.(?:post|put|patch|delete|request|queueRequest)\s*\(/],
  ['direct Discord HTTP API access', /https?:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api/i],
  ['manual Discord REST client', /\bnew\s+REST\s*\(/],
  ['direct guild leave outside controlled wrapper', /\.leave\s*\(/],
  ['ban operation', /\.ban\s*\(/],
  ['kick operation', /\.kick\s*\(/],
  ['timeout operation', /\.timeout\s*\(/],
  ['communication timeout operation', /\.disableCommunicationUntil\s*\(/],
  ['nickname mutation', /\.setNickname\s*\(/],
  ['member role mutation', /\.roles\.(?:add|remove|set)\s*\(/],
  ['member manager mutation', /\.members\.(?:ban|kick|edit)\s*\(/],
  ['channel manager mutation', /\.channels\.(?:create|edit|delete|setPosition|setPositions)\s*\(/],
  ['role manager mutation', /\.roles\.(?:create|edit|delete|setPosition|setPositions)\s*\(/],
  ['permission overwrite mutation', /\.permissionOverwrites\.(?:create|edit|delete|set)\s*\(/],
  ['message manager deletion', /\.messages\.(?:delete|bulkDelete)\s*\(/],
  ['bulk message deletion', /\.bulkDelete\s*\(/],
  ['webhook creation', /\.createWebhook\s*\(/],
  ['AutoMod administrative mutation', /\.autoModerationRules\.(?:create|edit|delete)\s*\(/],
  ['direct outbound Gateway packet', /\.ws\.(?:send|broadcast)\s*\(/],
  ['presence mutation', /\.setPresence\s*\(/],
  ['activity mutation', /\.setActivity\s*\(/],
  ['status mutation', /\.setStatus\s*\(/]
];

for (const name of fs.readdirSync(sourceDir)) {
  if (!name.endsWith('.ts') || excluded.has(name)) continue;
  const content = fs.readFileSync(path.join(sourceDir, name), 'utf8');
  for (const [label, pattern] of forbiddenSourcePatterns) {
    if (pattern.test(content)) {
      throw new Error(`Forbidden Discord capability detected in ${name}: ${label}`);
    }
  }

  if (name !== 'dispatcher.ts' && /\.send\s*\(/.test(content)) {
    throw new Error(`Discord-style send call is only allowed in dispatcher.ts, found in ${name}`);
  }
}

console.log('Discord capability policy check passed');
