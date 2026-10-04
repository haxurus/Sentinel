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

const api = async <T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> => {
  const response = await fetch(`${internalUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${internalKey}` },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    const error = new Error(`Internal bot API failed with status ${response.status}`) as Error & { status?: number };
    error.status = response.status;
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
