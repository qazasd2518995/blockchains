import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect, type ReactNode } from 'react';
import type { MemberPublic, TransferEntry } from '@bg/shared';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeDollarSign,
  LockKeyhole,
  SendHorizontal,
  WalletCards,
  X,
} from 'lucide-react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { Modal } from './Modal';
import { requestAdminLiveRefresh } from '@/lib/adminRefreshEvents';

const schema = z.object({
  direction: z.enum(['DEPOSIT', 'WITHDRAW']),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, '金額需為正數，最多兩位小數')
    .refine((value) => Number.parseFloat(value) > 0, '金額必須大於 0'),
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
    if (!open) return;
    setMyBalance(me?.balance ?? null);
    if (!member.agentId) return;
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
    const source = direction === 'DEPOSIT' ? (myBalance ?? me?.balance) : member.balance;
    if (source) setValue('amount', source, { shouldDirty: true, shouldValidate: true });
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
      requestAdminLiveRefresh();
      reset();
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  const agentName = me?.username ?? member.agentUsername ?? '代理';
  const agentBalance = myBalance ?? me?.balance ?? null;
  const fromPays = direction === 'DEPOSIT';
  const payerName = fromPays ? agentName : member.username;
  const payerBalance = fromPays ? agentBalance : member.balance;
  const payerAfter = payerBalance ? estimate(payerBalance, amountStr, 'WITHDRAW') : '—';
  const receiverName = fromPays ? member.username : agentName;
  const receiverBalance = fromPays ? member.balance : agentBalance;
  const receiverAfter = receiverBalance ? estimate(receiverBalance, amountStr, 'DEPOSIT') : '—';
  const payerBefore = payerBalance ? fmt(payerBalance) : '—';
  const receiverBefore = receiverBalance ? fmt(receiverBalance) : '—';
  const amountReady = /^\d+(\.\d{1,2})?$/.test(amountStr) && Number.parseFloat(amountStr) > 0;

  return (
    <Modal open={open} onClose={onClose} title="點數轉帳" subtitle={`目標會員 · ${member.username}`} width="lg">
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-5">
        <div className="border-b border-[#134A54]/50 bg-[#0F2D35] px-4 py-4 text-white sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] text-[#92D7E2]">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                TRANSFER DESK
              </div>
              <div className="mt-2 break-words text-[18px] font-black leading-tight sm:text-[22px]">
                {fromPays ? '代理存入會員' : '會員提領回代理'}
              </div>
              <div className="mt-1 text-[12px] text-white/65">
                目標會員已依列表選取鎖定，右側會即時預估雙方轉後餘額。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
              <BalanceTile label="操作代理" username={agentName} balance={agentBalance ? fmt(agentBalance) : '—'} tone="light" />
              <BalanceTile label="目標會員" username={member.username} balance={fmt(member.balance)} tone="muted" />
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <section className="rounded-[8px] border border-[#D6DEE4] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
              <SectionHeading index="01" title="轉帳方向" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DirectionOption
                  input={<input type="radio" value="DEPOSIT" {...register('direction')} className="sr-only" />}
                  icon={<ArrowDownToLine className="h-5 w-5" aria-hidden="true" />}
                  title="存入會員"
                  detail="操作代理扣款，目標會員加點"
                  checked={direction === 'DEPOSIT'}
                  tone="deposit"
                />
                <DirectionOption
                  input={<input type="radio" value="WITHDRAW" {...register('direction')} className="sr-only" />}
                  icon={<ArrowUpFromLine className="h-5 w-5" aria-hidden="true" />}
                  title="提領回代理"
                  detail="目標會員扣款，操作代理加點"
                  checked={direction === 'WITHDRAW'}
                  tone="withdraw"
                />
              </div>
            </section>

            <section className="rounded-[8px] border border-[#D6DEE4] bg-[#F8FBFC] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
              <SectionHeading index="02" title="目標與金額" />
              <div className="mt-3 space-y-4">
                <div className="rounded-[8px] border border-[#186073]/25 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-400">已鎖定會員</div>
                      <div className="mt-1 truncate font-mono text-[15px] font-black text-ink-900">{member.username}</div>
                      <div className="mt-1 data-num text-[12px] text-[#186073]">目前 {fmt(member.balance)}</div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#186073]/25 bg-[#EFF8FB] px-2.5 py-1 text-[10px] font-bold text-[#186073]">
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                      LOCKED
                    </span>
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="label">金額</span>
                    <button
                      type="button"
                      onClick={fillMax}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#186073]/30 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#186073] transition hover:bg-[#EFF8FB]"
                    >
                      <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
                      全部餘額
                    </button>
                  </div>
                  <div className="relative">
                    <BadgeDollarSign className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#186073]" aria-hidden="true" />
                    <input
                      type="text"
                      inputMode="decimal"
                      {...register('amount')}
                      className={`term-input h-14 pl-10 font-mono text-[24px] font-semibold ${errors.amount ? 'border-[#D4574A]/60 bg-[#FDF0EE]' : ''}`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.amount && (
                    <div className="mt-2 rounded-[6px] border border-[#D4574A]/25 bg-[#FDF0EE] px-2 py-1 text-[10px] text-[#D4574A]">
                      {errors.amount.message}
                    </div>
                  )}
                </label>

                <label className="block">
                  <div className="label mb-2">備註</div>
                  <input
                    type="text"
                    {...register('description')}
                    className="term-input"
                    placeholder="選填，會出現在轉帳紀錄"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="rounded-[8px] border border-[#186073]/25 bg-[#F2F8FA] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
            <SectionHeading index="03" title="轉帳預覽" />
            <div className="mt-3 space-y-3">
              <PreviewAccount label="扣款方" username={payerName} before={payerBefore} after={amountReady ? payerAfter : '—'} tone="danger" />
              <div className="flex justify-center">
                <div className="grid h-9 w-9 place-items-center rounded-full border border-[#186073]/25 bg-white text-[#186073]">
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <PreviewAccount label="收款方" username={receiverName} before={receiverBefore} after={amountReady ? receiverAfter : '—'} tone="success" />
            </div>

            <div className="mt-4 rounded-[8px] border border-[#D4AF37]/35 bg-[#FFF8DA] p-3 text-[11px] leading-relaxed text-[#6D5716]">
              {agentBalance ? '提交後會直接寫入會員轉帳紀錄，並同步更新雙方餘額。' : '正在同步最新代理餘額，仍可先輸入金額。'}
            </div>
          </aside>
        </div>

        {err && (
          <div className="mt-4 rounded-[8px] border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            {err}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#E5E7EB] pt-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onClose} className="btn-teal-outline inline-flex items-center justify-center gap-2">
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </button>
          <button type="submit" disabled={isSubmitting} className="btn-acid inline-flex items-center justify-center gap-2">
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? '處理中' : '確認轉帳'}
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

function SectionHeading({ index, title }: { index: string; title: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-[#186073] text-[10px] font-black text-white">
        {index}
      </span>
      <span className="text-[12px] font-black tracking-[0.16em] text-ink-800">{title}</span>
    </div>
  );
}

function DirectionOption({
  input,
  icon,
  title,
  detail,
  checked,
  tone,
}: {
  input: ReactNode;
  icon: ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  tone: 'deposit' | 'withdraw';
}): JSX.Element {
  const activeClass = tone === 'deposit'
    ? 'border-[#2BAA6A] bg-[#EFFAF4] text-[#15663E]'
    : 'border-[#D4574A] bg-[#FDF0EE] text-[#9D3028]';
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[8px] border bg-white p-3 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#186073]/30 ${checked ? activeClass : 'border-[#D6DEE4] text-ink-700 hover:border-[#186073]/45'}`}
    >
      {input}
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[8px] ${checked ? 'bg-white/85' : 'bg-[#EEF3F5]'}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-black">{title}</span>
        <span className="mt-1 block text-[11px] leading-snug text-ink-500">{detail}</span>
      </span>
    </label>
  );
}

function BalanceTile({
  label,
  username,
  balance,
  tone,
}: {
  label: string;
  username: string;
  balance: string;
  tone: 'light' | 'muted';
}): JSX.Element {
  return (
    <div className={`rounded-[8px] border px-3 py-2 ${tone === 'light' ? 'border-white/25 bg-white/12' : 'border-white/15 bg-white/6'}`}>
      <div className="text-[10px] font-semibold tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-1 truncate text-[12px] font-bold text-white">{username}</div>
      <div className="data-num mt-1 text-[16px] font-black text-[#E5C76C]">{balance}</div>
    </div>
  );
}

function PreviewAccount({
  label,
  username,
  before,
  after,
  tone,
}: {
  label: string;
  username: string;
  before: string;
  after: string;
  tone: 'danger' | 'success';
}): JSX.Element {
  return (
    <div className="rounded-[8px] border border-[#D6DEE4] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-ink-400">{label}</div>
          <div className="mt-1 truncate font-mono text-[13px] font-black text-ink-900">{username}</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone === 'danger' ? 'bg-[#FDF0EE] text-[#D4574A]' : 'bg-[#EFFAF4] text-[#2BAA6A]'}`}>
          {tone === 'danger' ? '扣款' : '入帳'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-ink-400">目前</div>
          <div className="data-num mt-1 text-ink-700">{before}</div>
        </div>
        <div className="text-right">
          <div className="text-ink-400">轉後</div>
          <div className={`data-num mt-1 font-black ${tone === 'danger' ? 'text-[#D4574A]' : 'text-[#2BAA6A]'}`}>{after}</div>
        </div>
      </div>
    </div>
  );
}
