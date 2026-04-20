import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditActor {
  id: string | null;
  type: 'agent' | 'super_admin' | 'system';
  username: string;
}

export interface AuditPayload {
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  req?: Pick<FastifyRequest, 'ip' | 'headers'>;
}

export async function writeAudit(db: Db, payload: AuditPayload): Promise<void> {
  const ua = payload.req?.headers?.['user-agent'];
  await db.auditLog.create({
    data: {
      actorId: payload.actor.id,
      actorType: payload.actor.type,
      actorUsername: payload.actor.username,
      action: payload.action,
      targetType: payload.targetType ?? null,
      targetId: payload.targetId ?? null,
      oldValues:
        payload.oldValues === undefined
          ? Prisma.JsonNull
          : (payload.oldValues as Prisma.InputJsonValue),
      newValues:
        payload.newValues === undefined
          ? Prisma.JsonNull
          : (payload.newValues as Prisma.InputJsonValue),
      ipAddress: payload.req?.ip ?? null,
      userAgent: typeof ua === 'string' ? ua : null,
    },
  });
}
