import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateServerSeed, sha256 } from '@bg/provably-fair';
import type { ActiveSeedsResponse, RotateSeedResponse } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const rotateSchema = z.object({
  gameCategory: z.string().min(1).max(30),
});

const updateClientSeedSchema = z.object({
  seed: z.string().min(4).max(64),
});

export async function pfRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/active', async (req): Promise<ActiveSeedsResponse> => {
    const seeds = await fastify.prisma.serverSeed.findMany({
      where: { userId: req.userId, isActive: true },
    });
    const clientSeedRecord = await fastify.prisma.clientSeed.findFirst({
      where: { userId: req.userId, isActive: true },
    });
    const clientSeed = clientSeedRecord?.seed ?? '';
    return {
      seeds: seeds.map((s) => ({
        gameCategory: s.gameCategory,
        serverSeedHash: s.seedHash,
        clientSeed,
        nonce: s.nonce,
      })),
    };
  });

  fastify.post('/rotate', async (req): Promise<RotateSeedResponse> => {
    const body = rotateSchema.parse(req.body);
    return fastify.prisma.$transaction(async (tx) => {
      const current = await tx.serverSeed.findFirst({
        where: { userId: req.userId, gameCategory: body.gameCategory, isActive: true },
      });
      if (!current) throw new ApiError('SEED_NOT_REVEALED', 'No active seed');

      await tx.serverSeed.update({
        where: { id: current.id },
        data: { isActive: false, revealedAt: new Date() },
      });

      const newSeed = generateServerSeed();
      const created = await tx.serverSeed.create({
        data: {
          userId: req.userId,
          gameCategory: body.gameCategory,
          seed: newSeed,
          seedHash: sha256(newSeed),
          isActive: true,
          nonce: 0,
        },
      });

      return {
        revealedServerSeed: current.seed,
        revealedSeedHash: current.seedHash,
        revealedNonce: current.nonce,
        newSeedHash: created.seedHash,
      };
    });
  });

  fastify.post('/client-seed', async (req, reply) => {
    const body = updateClientSeedSchema.parse(req.body);
    await fastify.prisma.$transaction(async (tx) => {
      await tx.clientSeed.updateMany({
        where: { userId: req.userId, isActive: true },
        data: { isActive: false },
      });
      await tx.clientSeed.create({
        data: { userId: req.userId, seed: body.seed, isActive: true },
      });
    });
    reply.code(204).send();
  });
}
