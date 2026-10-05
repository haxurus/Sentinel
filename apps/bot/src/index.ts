import {
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from 'discord.js';
import { prisma } from '@sentinel/db';
import { config } from './config.js';
import { logger } from './logger.js';
import { ensureGuild, isGuildInstallBlocked, runRetentionCleanup } from './store.js';
import { registerHandlers } from './handlers.js';
import { startDispatcher } from './dispatcher.js';
import { recordEvent } from './recorder.js';
import { queueConnection } from './queue.js';
import { startInternalApi } from './internal-api.js';
import { installDiscordCapabilityPolicy } from './capability-policy.js';
import { leaveGuild } from './discord-actions.js';
import { redactText } from './security.js';

const errorText = (error: unknown) => redactText(error instanceof Error ? `${error.name}: ${error.message}` : String(error));

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

installDiscordCapabilityPolicy(client, ({ method, route }) => {
  logger.error({ method, route }, 'Blocked Discord mutation by capability policy');
});

registerHandlers(client);
let worker: ReturnType<typeof startDispatcher> | null = null;
let internalApi: ReturnType<typeof startInternalApi> | null = null;

client.once(Events.ClientReady, async (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Discord bot ready');

  // Delivery and the internal API must come up even if one guild fails to
  // initialise; otherwise a single bad row would silently stop every log.
  worker = startDispatcher(client);
  internalApi = startInternalApi(client, config.internalApiKey, config.internalApiPort);

  for (const guild of ready.guilds.cache.values()) {
    try {
      if (await isGuildInstallBlocked(guild.id)) {
        logger.warn({ guildId: guild.id, guildName: guild.name }, 'Leaving blocked guild');
        await leaveGuild(guild, 'blocked-guild');
        continue;
      }
      await ensureGuild(guild);
      await recordEvent({ guildId: guild.id, eventKey: 'system.ready', actorId: ready.user.id, summary: `Bot connesso come ${ready.user.tag}.`, details: { guildCount: ready.guilds.cache.size, botUserId: ready.user.id, actorBot: true } });
    } catch (error) {
      logger.error({ guildId: guild.id, error: errorText(error) }, 'Guild initialisation failed');
    }
  }
  await runRetentionCleanup().catch((error) => logger.error({ error: errorText(error) }, 'Initial retention cleanup failed'));
});

const recordForAllGuilds = async (eventKey: 'system.warn' | 'system.error', summary: string, details: Record<string, unknown>) => {
  for (const guild of client.guilds.cache.values()) {
    await recordEvent({ guildId: guild.id, eventKey, summary, details }).catch(() => null);
  }
};

client.on(Events.Warn, (warning) => {
  logger.warn({ warning: redactText(warning) }, 'Discord client warning');
  void recordForAllGuilds('system.warn', 'Warning del client Discord.', { warning: redactText(warning) });
});

client.on(Events.Error, (error) => {
  logger.error({ error: errorText(error) }, 'Discord client error');
  void recordForAllGuilds('system.error', 'Errore del client Discord.', { message: redactText(error.message), name: error.name });
});

setInterval(() => {
  runRetentionCleanup().catch((error) => logger.error({ error: errorText(error) }, 'Retention cleanup failed'));
}, 6 * 60 * 60 * 1000).unref();

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  // Docker sends SIGKILL after its grace period; never hang past it.
  setTimeout(() => process.exit(1), 8_000).unref();
  try {
    if (internalApi) await new Promise<void>((resolve) => internalApi!.close(() => resolve()));
    // Close the worker first so in-flight sends finish while the client is
    // still connected; unfinished jobs stay in Redis for the next start.
    if (worker) await worker.close();
    await client.destroy();
    await queueConnection.quit();
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ error: errorText(error) }, 'Shutdown error');
  }
  process.exit(0);
};

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: errorText(reason) }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error: errorText(error) }, 'Uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await client.login(config.discordToken);
