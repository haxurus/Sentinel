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
import { onQuotaExceeded } from './recorder.js';
import { createStatusNotifier } from './status.js';
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

const status = createStatusNotifier(client);
registerHandlers(client, status);
onQuotaExceeded((guildId, limit, tier) => {
  const guild = client.guilds.cache.get(guildId);
  status.notify({
    level: 'warn',
    title: 'Quota giornaliera raggiunta',
    description: `**${guild?.name ?? guildId}** ha superato ${limit.toLocaleString('it-IT')} eventi oggi (piano ${tier}): gli eventi successivi non vengono registrati fino a mezzanotte UTC.`,
    fields: [{ name: 'Server', value: `\`${guildId}\`` }],
    dedupeKey: `quota:${guildId}`
  });
});
let worker: ReturnType<typeof startDispatcher> | null = null;
let internalApi: ReturnType<typeof startInternalApi> | null = null;

client.once(Events.ClientReady, async (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'Discord bot ready');

  // Delivery and the internal API must come up even if one guild fails to
  // initialise; otherwise a single bad row would silently stop every log.
  worker = startDispatcher(client);
  internalApi = startInternalApi(client, config.internalApiKey, config.internalApiPort, status);

  for (const guild of ready.guilds.cache.values()) {
    try {
      if (await isGuildInstallBlocked(guild.id)) {
        logger.warn({ guildId: guild.id, guildName: guild.name }, 'Leaving blocked guild');
        await leaveGuild(guild, 'blocked-guild');
        continue;
      }
      await ensureGuild(guild);
    } catch (error) {
      logger.error({ guildId: guild.id, error: errorText(error) }, 'Guild initialisation failed');
    }
  }
  status.notify({
    level: 'ok',
    title: 'Sentinel online',
    description: `Connesso a Discord come **${ready.user.tag}**.`,
    fields: [
      { name: 'Server', value: String(ready.guilds.cache.size) },
      { name: 'Avvio', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    ]
  });
  await runRetentionCleanup().catch((error) => logger.error({ error: errorText(error) }, 'Initial retention cleanup failed'));
});

// Bot health goes to the instance status channel chosen in the super
// console, not to the servers being logged.
client.on(Events.Warn, (warning) => {
  logger.warn({ warning: redactText(warning) }, 'Discord client warning');
  status.notify({ level: 'warn', title: 'Warning del client Discord', description: redactText(warning) });
});

client.on(Events.Error, (error) => {
  logger.error({ error: errorText(error) }, 'Discord client error');
  status.notify({ level: 'error', title: 'Errore del client Discord', description: errorText(error) });
});

client.on(Events.ShardResume, (shardId, replayed) => {
  status.notify({ level: 'info', title: 'Connessione a Discord ripristinata', description: `Shard ${shardId}: ${replayed} eventi recuperati.`, dedupeKey: 'shard-resume' });
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
  status.notify({ level: 'error', title: 'Errore non gestito nel bot', description: errorText(reason) });
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error: errorText(error) }, 'Uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await client.login(config.discordToken);
