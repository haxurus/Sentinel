import fs from 'node:fs';
const required = (name: string) => {
  const file = process.env[`${name}_FILE`]?.trim();
  const value = file ? fs.readFileSync(file, 'utf8').trim() : process.env[name]?.trim();
  if (!value) throw new Error(`Missing secret/config: ${name} or ${name}_FILE`);
  return value;
};

const production = process.env.NODE_ENV === 'production';
const publicBaseUrl = required('PUBLIC_BASE_URL');
const webUrl = required('WEB_URL');
const sessionSecret = required('SESSION_SECRET');
const encryptionKey = required('LOG_DATA_ENCRYPTION_KEY');
const inviteAllowedUserIds = (process.env.INVITE_ALLOWED_USER_IDS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (inviteAllowedUserIds.some((value) => !/^\d{17,20}$/.test(value))) {
  throw new Error('INVITE_ALLOWED_USER_IDS must contain comma-separated Discord user IDs');
}

if (production) {
  if (!publicBaseUrl.startsWith('https://') || !webUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL and WEB_URL must use HTTPS in production');
  if (sessionSecret.length < 48) throw new Error('SESSION_SECRET must be at least 48 characters in production');
  if (Buffer.from(encryptionKey, 'base64').length !== 32) throw new Error('LOG_DATA_ENCRYPTION_KEY must be 32 random bytes encoded as base64');
}

export const config = {
  clientId: required('DISCORD_CLIENT_ID'),
  clientSecret: required('DISCORD_CLIENT_SECRET'),
  publicBaseUrl,
  webUrl,
  sessionSecret,
  inviteAllowedUserIds,
  port: Number(process.env.PORT ?? 3001),
  production
};
