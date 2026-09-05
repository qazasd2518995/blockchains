import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import { TransferService } from './transfer.service.js';
import { agentToAgentSchema, agentToMemberSchema, csTransferSchema } from './transfer.schema.js';

vi.mock('../controls/controls.runtime.js', () => ({
  cancelMemberDepositControlsForBalanceMovement: vi.fn(),
  resetMemberAutoBalanceControl: vi.fn(),
}));
vi.mock('../../../utils/hierarchy.js', () => ({
  canManageAgent: vi.fn(async () => true),
  canManageMember: vi.fn(async () => true),
  isAgentInSharedSuperAdminLine: vi.fn(async () => true),
  listAgentDescendants: vi.fn(async () => ['a']),
}));
const operator = {
  id: 'root',
  username: 'root',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  level: 0,
  canManageControlZone: true,
} as AdminCurrent;
const requestId = '4eaed7ab-04e0-4f56-8aba-c35acb30601c';
function fixture() {
  let balances = new Map(['a', 'b', 'member'].map((id) => [id, new Prisma.Decimal('1000.37')]));
  let rows: any[] = [],
    audits: any[] = [],
    ledger: any[] = [];
  let failAudit = false,
    tail = Promise.resolve();
  const model = {
    findUnique: async ({ where }: any) => ({
      id: where.id,
      username: where.id,
      role: 'AGENT',
      agentId: 'a',
      balance: balances.get(where.id),
    }),
    update: async ({ where, data }: any) => {
      balances.set(where.id, data.balance);
      return { id: where.id, ...data };
    },
  };
  const db: any = {
    agent: model,
    user: model,
    pointTransfer: {
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row = { id: data.id ?? `legacy-${rows.length}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
    },
    transaction: {
      create: async ({ data }: any) => {
        ledger.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (failAudit) throw Error('audit unavailable');
        audits.push(data);
        return data;
      },
    },
    $transaction: (fn: any) => {
      const run = tail.then(async () => {
        const old = {
          balances: new Map(balances),
          rows: [...rows],
          audits: [...audits],
          ledger: [...ledger],
        };
        try {
          return await fn(db);
        } catch (error) {
          ({ balances, rows, audits, ledger } = old);
          throw error;
        }
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  return {
    service: new TransferService(db as PrismaClient),
    db,
    state: () => ({ balances, rows, audits, ledger }),
    failAudit: (value: boolean) => {
      failAudit = value;
    },
  };
}
const cases = [
  ['agentToAgent', { fromId: 'a', toId: 'b', amount: '10.37' }],
  ['agentToMember', { agentId: 'a', memberId: 'member', amount: '10.37' }],
  ['agentToMember', { agentId: 'a', memberId: 'member', amount: '-10.37' }],
  ['csAgent', { targetId: 'a', amount: '10.37' }],
  ['csAgent', { targetId: 'a', amount: '-10.37' }],
  ['csMember', { targetId: 'member', amount: '10.37' }],
  ['csMember', { targetId: 'member', amount: '-10.37' }],
] as const;
describe('transfer precision, atomic audit and durable operation replay', () => {
  it.each(['0.005', '-0.005', 'NaN', '1e3', '100abc', '1000000000000000000.00'])(
    'rejects unsafe amount %s at every schema',
    (amount) => {
      expect(agentToAgentSchema.safeParse({ fromId: 'a', toId: 'b', amount }).success).toBe(false);
      expect(agentToMemberSchema.safeParse({ agentId: 'a', memberId: 'm', amount }).success).toBe(
        false,
      );
      expect(csTransferSchema.safeParse({ targetId: 'a', amount }).success).toBe(false);
    },
  );
  for (const [method, input] of cases) {
    const title = `${method} ${input.amount}`;
    const call = (f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) =>
      (f.service[method] as any)(operator, { ...input, requestId, ...patch });
    it(`${title} rejects sub-cent direct service calls before mutation`, async () => {
      const f = fixture();
      await expect(call(f, { amount: '0.005' })).rejects.toThrow();
      expect(f.state().rows).toHaveLength(0);
      expect([...f.state().balances.values()].every((v) => v.eq('1000.37'))).toBe(true);
    });
    it(`${title} returns the same committed result for duplicate/reconnected requests`, async () => {
      const f = fixture();
      const first = await call(f);
      const duplicates = await Promise.all([call(f), call(f)]);
      expect(duplicates).toEqual([first, first]);
      expect(f.state().rows).toHaveLength(1);
      expect(f.state().audits).toHaveLength(1);
      expect(f.state().ledger).toHaveLength(method.endsWith('Member') ? 1 : 0);
      if (method.startsWith('agent')) {
        expect(
          [...f.state().balances.values()]
            .reduce((a, b) => a.add(b), new Prisma.Decimal(0))
            .toFixed(2),
        ).toBe('3001.11');
      }
      await expect(call(f, { amount: '20' })).rejects.toMatchObject({ code: 'INVALID_TRANSFER' });
      await expect(call(f, { description: 'different' })).rejects.toMatchObject({
        code: 'INVALID_TRANSFER',
      });
      if (method.startsWith('cs'))
        await expect(
          call(f, { amount: new Prisma.Decimal(input.amount).neg().toString() }),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSFER' });
      expect(f.state().rows).toHaveLength(1);
    });
    it(`${title} rolls back money and ledger if audit fails, then retries once`, async () => {
      const f = fixture();
      f.failAudit(true);
      await expect(call(f)).rejects.toThrow('audit unavailable');
      expect([...f.state().balances.values()].every((v) => v.eq('1000.37'))).toBe(true);
      expect(f.state().rows).toHaveLength(0);
      expect(f.state().ledger).toHaveLength(0);
      f.failAudit(false);
      await call(f);
      expect(f.state().rows).toHaveLength(1);
    });
  }
});
