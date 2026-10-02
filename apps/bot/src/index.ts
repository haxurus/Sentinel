import {
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from 'discord.js';
import pino from 'pino';
import { prisma } from '@sentinel/db';
import { config } from './config.js';
import { ensureGuild, runRetentionCleanup } from './store.js';
import { registerHandlers } from './handlers.js';
import { startDispatcher } from './dispatcher.js';
import { recordEvent } from './recorder.js';
import { queueConnection } from './queue.js';
import { startInternalApi } from './internal-api.js';

const logger = pino({ level: config.logLevel });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
    GatewayIntentBits.GuildMessagePolls
  ],
  partials: [Partials.User, Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction]
});

registerHandlers(client);
let worker: ReturnType<typeof startDispatcher> | null = null;
let internalApi: ReturnType<typeof startInternalApi> | null = null;

client.once(Events.ClientReady, async (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Discord bot ready');
  for (const guild of ready.guilds.cache.values()) {
    await ensureGuild(guild);
  }
  worker = startDispatcher(client);
  internalApi = startInternalApi(client, config.internalApiKey, config.internalApiPort);
  for (const guild of ready.guilds.cache.values()) {
    await recordEvent({ guildId: guild.id, eventKey: 'system.ready', actorId: ready.user.id, summary: `Bot connesso come ${ready.user.tag}.`, details: { guildCount: ready.guilds.cache.size, botUserId: ready.user.id, actorBot: true } });
  }
  await runRetentionCleanup().catch((error) => logger.error(error, 'Initial retention cleanup failed'));
});


client.on(Events.Warn, async (warning) => {
  logger.warn({ warning }, 'Discord client warning');
  for (const guild of client.guilds.cache.values()) {
    await recordEvent({ guildId: guild.id, eventKey: 'system.warn', summary: 'Warning del client Discord.', details: { warning }, }).catch(() => null);
  }
});

client.on(Events.Error, async (error) => {
  logger.error(error, 'Discord client error');
  for (const guild of client.guilds.cache.values()) {
    await recordEvent({ guildId: guild.id, eventKey: 'system.error', summary: 'Errore del client Discord.', details: { message: error.message, name: error.name } }).catch(() => null);
  }
});

setInterval(() => {
  runRetentionCleanup().catch((error) => logger.error(error, 'Retention cleanup failed'));
}, 6 * 60 * 60 * 1000).unref();

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  client.destroy();
  if (worker) await worker.close();
  if (internalApi) await new Promise<void>((resolve) => internalApi!.close(() => resolve()));
  await queueConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await client.login(config.discordToken);
