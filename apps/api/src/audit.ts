import { prisma } from '@sentinel/db';
import type { FastifyRequest } from 'fastify';
import type { SessionInfo } from './auth.js';
import { hashIp } from './auth.js';
import { clientIp } from './helpers.js';
import { protectJson } from './security.js';

export async function panelAudit(request: FastifyRequest, session: SessionInfo, guildId: string, action: string, details: Record<string, unknown>) {
  await prisma.panelAudit.create({
    data: {
      guildId,
      userId: session.userId,
      username: session.username,
      action,
      details: protectJson(JSON.parse(JSON.stringify(details))),
      ipHash: hashIp(clientIp(request))
    }
  });
}
