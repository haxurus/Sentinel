import { prisma } from '@sentinel/db';
import { eventDefinition } from '@sentinel/shared';
import { logQueue } from './queue.js';
import { jsonSafe, redactSecrets } from './utils.js';
import { protectJson, redactText } from './security.js';

export type RecordInput = {
  guildId: string;
  eventKey: string;
  actorId?: string | null;
  targetId?: string | null;
  channelId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

export async function recordEvent(input: RecordInput) {
  const route = await prisma.logRoute.findUnique({
    where: { guildId_eventKey: { guildId: input.guildId, eventKey: input.eventKey } },
    select: {
      captureEnabled: true,
      enabled: true,
      guild: { select: { premiumEnabled: true } }
    }
  }).catch(() => null);

  const definition = eventDefinition(input.eventKey);
  if (definition?.noisy && !route?.guild.premiumEnabled) return null;
  if (route && !route.captureEnabled) return null;

  const sanitizedDetails = jsonSafe(redactSecrets(input.details ?? {}));
  const serializedDetails = JSON.stringify(sanitizedDetails);
  const boundedDetails = serializedDetails.length <= 64_000
    ? sanitizedDetails
    : { truncated: true, originalBytes: Buffer.byteLength(serializedDetails), preview: serializedDetails.slice(0, 60_000) };

  const event = await prisma.logEvent.create({
    data: {
      guildId: input.guildId,
      eventKey: input.eventKey,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      channelId: input.channelId ?? null,
      summary: input.summary,
      details: protectJson(boundedDetails),
      dispatchState: route?.enabled === false ? 'DISABLED' : 'PENDING'
    }
  });

  if (route?.enabled !== false) {
    try {
      await logQueue.add('dispatch', { eventId: event.id }, {
        jobId: event.id,
        removeOnComplete: 500,
        removeOnFail: 1000,
        attempts: 4,
        backoff: { type: 'exponential', delay: 1500 }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.logEvent.update({ where: { id: event.id }, data: { dispatchState: 'QUEUE_ERROR', dispatchError: redactText(message).slice(0, 1000) } }).catch(() => null);
      console.error('Unable to enqueue Discord log', event.id, redactText(message));
    }
  }

  return event;
}
