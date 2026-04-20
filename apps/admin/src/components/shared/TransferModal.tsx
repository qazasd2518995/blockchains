import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import type { MemberPublic, TransferEntry } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  direction: z.enum(['DEPOSIT', 'WITHDRAW']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().max(200).optional(),
});
type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  member: MemberPublic;
  onDone: () => void;
}

export function TransferModal({ open, onClose, member, onDone }: Props): JSX.Element {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { direction: 'DEPOSIT', amount: '', description: '' },
  });
  const direction = watch('direction');
  const amountStr = watch('amount');

  const onSubmit = async (data: FormInput) => {
    if (!member.agentId) {
      setErr('Member has no agent');
      return;
    }
    setErr(null);
    try {
      const signed = data.direction === 'DEPOSIT' ? data.amount : `-${data.amount}`;
      await adminApi.post<TransferEntry>('/transfers/agent-to-member', {
        agentId: member.agentId,
        memberId: member.id,
        amount: signed,
        description: data.description || undefined,
      });
      reset();
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  const estNext = estimate(member.balance, amountStr, direction);

  return (
    <Modal open={open} onClose={onClose} title="TRANSFER" subtitle={t.transfers.newTransfer} width="md">
      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">MEMBER</span>
          <span className="font-mono text-ink-900">{member.email}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-ink-500">CURRENT BAL</span>
          <span className="data-num text-neon-acid">{fmt(member.balance)}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <div className="label mb-2">{t.transfers.direction}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-toxic has-[:checked]:bg-neon-toxic/10 has-[:checked]:text-neon-toxic">
              <input type="radio" value="DEPOSIT" {...register('direction')} className="sr-only" />
              <span>⇩ {t.transfers.deposit}</span>
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-ember has-[:checked]:bg-neon-ember/10 has-[:checked]:text-neon-ember">
              <input type="radio" value="WITHDRAW" {...register('direction')} className="sr-only" />
              <span>⇧ {t.transfers.withdraw}</span>
            </label>
          </div>
        </div>

        <label className="block">
          <div className="label mb-2">{t.transfers.amount}</div>
          <input
            type="text"
            inputMode="decimal"
            {...register('amount')}
            className="term-input font-mono text-lg"
            placeholder="0.00"
          />
          {errors.amount && <div className="mt-1 text-[10px] text-neon-ember">⚠ {errors.amount.message}</div>}
        </label>

        <label className="block">
          <div className="label mb-2">{t.transfers.description}</div>
          <input type="text" {...register('description')} className="term-input" />
        </label>

        <div className="border border-neon-acid/30 bg-neon-acid/5 p-3 text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-500">NEXT MEMBER BAL</span>
            <span className="data-num text-neon-acid">{estNext}</span>
          </div>
        </div>

        {err && <div className="border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">⚠ {err}</div>}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → {t.common.confirm}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            [{t.common.cancel}]
          </button>
        </div>
      </form>
    </Modal>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function estimate(balanceStr: string, amountStr: string, dir: 'DEPOSIT' | 'WITHDRAW'): string {
  const b = Number.parseFloat(balanceStr);
  const a = Number.parseFloat(amountStr);
  if (Number.isNaN(b) || Number.isNaN(a)) return fmt(balanceStr);
  const next = dir === 'DEPOSIT' ? b + a : b - a;
  return fmt(next.toString());
}
