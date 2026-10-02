import fs from 'node:fs';
const required = (name: string) => {
  const file = process.env[`${name}_FILE`]?.trim();
  const value = file ? fs.readFileSync(file, 'utf8').trim() : process.env[name]?.trim();
  if (!value) throw new Error(`Missing secret/config: ${name} or ${name}_FILE`);
  return value;
};

const redisUrl = required('REDIS_URL');
if (process.env.NODE_ENV === 'production' && !/^rediss?:\/\/:[^@]+@/.test(redisUrl)) {
  throw new Error('REDIS_URL must include authentication in production');
}

const internalApiKey = required('BOT_INTERNAL_API_KEY');
if (process.env.NODE_ENV === 'production' && internalApiKey.length < 48) throw new Error('BOT_INTERNAL_API_KEY must be at least 48 characters');

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  internalApiKey,
  internalApiPort: Number(process.env.BOT_INTERNAL_PORT ?? 3002),
  redisUrl,
  logLevel: process.env.LOG_LEVEL ?? 'info'
};
