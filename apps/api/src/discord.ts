import fs from 'node:fs';

const required = (name: string) => {
  const file = process.env[`${name}_FILE`]?.trim();
  const value = file ? fs.readFileSync(file, 'utf8').trim() : process.env[name]?.trim();
  if (!value) throw new Error(`Missing secret/config: ${name} or ${name}_FILE`);
  return value;
};

const internalUrl = required('BOT_INTERNAL_URL').replace(/\/$/, '');
const internalKey = required('BOT_INTERNAL_API_KEY');
const SNOWFLAKE = /^\d{17,20}$/;

export type BotApiError = Error & { status?: number; body?: Record<string, unknown> };

const api = async <T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, timeoutMs = 5_000): Promise<T> => {
  const response = await fetch(`${internalUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${internalKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const error = new Error(`Internal bot API failed with status ${response.status}`) as BotApiError;
    error.status = response.status;
    error.body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
    throw error;
  }
  return response.json() as Promise<T>;
};

function id(value: string) {
  if (!SNOWFLAKE.test(value)) throw new Error('Invalid Discord snowflake');
  return value;
}

export async function getGuildResources(guildId: string) {
  return api<{
    channels: Array<{ id: string; name: string; type: number; parent_id?: string | null; position?: number }>;
    roles: Array<{ id: string; name: string; color: number; position: number; permissions: string }>;
  }>(`/guilds/${id(guildId)}/resources`);
}

export async function getGuildAccessSnapshot(guildId: string, userId: string) {
  const result = await api<{ owner: boolean; permissions: string; roles: string[] }>(`/guilds/${id(guildId)}/members/${id(userId)}/access`);
  return { owner: result.owner, permissions: BigInt(result.permissions), roles: result.roles };
}


export async function getBotGuilds() {
  return api<Array<{
    id: string;
    name: string;
    ownerId: string;
    ownerTag: string | null;
    memberCount: number;
    iconUrl: string | null;
  }>>('/guilds');
}

export async function leaveBotGuild(guildId: string) {
  return api<{ ok: true; guildId: string }>(`/guilds/${id(guildId)}/leave`, 'POST');
}

/** Brand plan: the bot's nickname and banner in one server (null resets). */
export async function setBotBranding(guildId: string, profile: { nick?: string | null; banner?: string | null }) {
  return api<{ ok: true; guildId: string }>(`/guilds/${id(guildId)}/branding`, 'POST', profile, 15_000);
}

export async function sendStatusTest() {
  return api<{ ok: true } | { ok: false; error: string }>('/status/test', 'POST', {}, 10_000);
}

/** Makes the bot pick up a new status channel immediately (best effort). */
export async function refreshStatusChannel() {
  return api<{ ok: true }>('/status/refresh', 'POST', {});
}
