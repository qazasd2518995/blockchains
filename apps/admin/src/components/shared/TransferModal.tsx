import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import type { MemberPublic, TransferEntry } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
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
  const { agent: me } = useAdminAuthStore();
  /** 代理（自己）當前餘額 — 從 /agents/:id 拿最新值，避免用 store 裡過期資料 */
  const [myBalance, setMyBalance] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { direction: 'DEPOSIT', amount: '', description: '' },
  });
  const direction = watch('direction');
  const amountStr = watch('amount');

  useEffect(() => {
    if (!open || !member.agentId) return;
    void (async () => {
      try {
        const res = await adminApi.get<{ id: string; balance: string }>(`/agents/${member.agentId}`);
        setMyBalance(res.data.balance);
      } catch {
        setMyBalance(me?.balance ?? null);
      }
    })();
  }, [open, member.agentId, me]);

  const fillMax = (): void => {
    // direction = DEPOSIT（代理→會員）→ 用代理餘額
    // direction = WITHDRAW（會員→代理）→ 用會員餘額
    const source = direction === 'DEPOSIT' ? myBalance : member.balance;
    if (source) setValue('amount', source);
  };

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
    <Modal open={open} onClose={onClose} title={t.transfers.title} subtitle={t.transfers.newTransfer} width="md">
      <div className="mb-4 grid grid-cols-2 gap-2 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div>
          <div className="text-ink-500">代理餘額（{me?.username ?? '—'}）</div>
          <div className="mt-0.5 data-num text-[#186073]">{myBalance ? fmt(myBalance) : '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-ink-500">{t.transfers.member}（{member.username}）</div>
          <div className="mt-0.5 data-num text-[#186073]">{fmt(member.balance)}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <div className="label mb-2">{t.transfers.direction}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-toxic has-[:checked]:bg-neon-toxic/10 has-[:checked]:text-win">
              <input type="radio" value="DEPOSIT" {...register('direction')} className="sr-only" />
              <span>⇩ {t.transfers.deposit}</span>
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-ember has-[:checked]:bg-neon-ember/10 has-[:checked]:text-[#D4574A]">
              <input type="radio" value="WITHDRAW" {...register('direction')} className="sr-only" />
              <span>⇧ {t.transfers.withdraw}</span>
            </label>
          </div>
        </div>

        <label className="block">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="label">{t.transfers.amount}</span>
            <button
              type="button"
              onClick={fillMax}
              className="text-[10px] font-semibold text-[#186073] hover:underline"
            >
              全部餘額
            </button>
          </div>
          <input
            type="text"
            inputMode="decimal"
            {...register('amount')}
            className="term-input font-mono text-lg"
            placeholder="0.00"
          />
          {errors.amount && <div className="mt-1 text-[10px] text-[#D4574A]">⚠ {errors.amount.message}</div>}
        </label>

        <label className="block">
          <div className="label mb-2">{t.transfers.description}</div>
          <input type="text" {...register('description')} className="term-input" />
        </label>

        <div className="grid grid-cols-2 gap-2 border border-[#186073]/55 bg-[#FAF2D7]/60 p-3 text-[11px]">
          <div>
            <div className="text-ink-500">代理轉後餘額</div>
            <div className="mt-0.5 data-num text-[#186073]">
              {myBalance ? estimate(myBalance, amountStr, direction === 'DEPOSIT' ? 'WITHDRAW' : 'DEPOSIT') : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-ink-500">{t.transfers.nextBal}（會員）</div>
            <div className="mt-0.5 data-num text-[#186073]">{estNext}</div>
          </div>
        </div>

        {err && <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">⚠ {err}</div>}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → {t.common.confirm}
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
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
