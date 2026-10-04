import { prisma } from '@sentinel/db';
import type { FastifyRequest } from 'fastify';
import type { SessionInfo } from './auth.js';
import { hashIp } from './auth.js';
import { protectJson } from './security.js';

export async function superAdminAudit(
  request: FastifyRequest,
  session: SessionInfo,
  action: string,
  subjectType: string | null,
  subjectId: string | null,
  details: Record<string, unknown> = {}
) {
  await prisma.superAdminAudit.create({
    data: {
      userId: session.userId,
      username: session.username,
      action,
      subjectType,
      subjectId,
      details: protectJson(JSON.parse(JSON.stringify(details))),
      ipHash: hashIp(request.ip)
    }
  });
}
