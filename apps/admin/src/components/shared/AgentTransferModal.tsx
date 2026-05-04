import { useEffect, useState, type ReactNode } from 'react';
import type { AgentPublic } from '@bg/shared';
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

type AgentTransferParty = { id: string; username: string; balance: string };

interface Props {
  open: boolean;
  onClose: () => void;
  sourceAgent: AgentTransferParty;
  targetAgent: AgentTransferParty;
  onDone: () => void;
}

type Direction = 'DEPOSIT' | 'WITHDRAW';

/**
 * 代理間轉帳 Modal（參考系統 adjustAgentBalanceModal）
 *   DEPOSIT：操作代理 → 被點擊的目標代理（從操作代理扣）
 *   WITHDRAW：被點擊的目標代理 → 操作代理（從目標代理扣）
 */
export function AgentTransferModal({ open, onClose, sourceAgent, targetAgent, onDone }: Props): JSX.Element {
  const { agent: me, setAgent } = useAdminAuthStore();
  const [direction, setDirection] = useState<Direction>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceBalance, setSourceBalance] = useState(sourceAgent.balance);
  const [targetBalance, setTargetBalance] = useState(targetAgent.balance);
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    setDirection('DEPOSIT');
    setAmount('');
    setDescription('');
    setErr(null);
    setSourceBalance(sourceAgent.balance);
    setTargetBalance(targetAgent.balance);

    if (!open) return;
    let active = true;
    setLoadingBalances(true);
    void Promise.allSettled([
      adminApi.get<AgentTransferParty>(`/agents/${sourceAgent.id}`),
      adminApi.get<AgentTransferParty>(`/agents/${targetAgent.id}`),
    ]).then((results) => {
      if (!active) return;
      const [sourceResult, targetResult] = results;
      if (sourceResult.status === 'fulfilled') setSourceBalance(sourceResult.value.data.balance);
      if (targetResult.status === 'fulfilled') setTargetBalance(targetResult.value.data.balance);
      setLoadingBalances(false);
    });

    return () => {
      active = false;
    };
  }, [open, sourceAgent.id, sourceAgent.balance, targetAgent.id, targetAgent.balance]);

  const fillMax = (): void => {
    setAmount(direction === 'DEPOSIT' ? sourceBalance : targetBalance);
  };

  const submit = async (): Promise<void> => {
    if (sourceAgent.id === targetAgent.id) {
      setErr('不能轉給同一個代理');
      return;
    }
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErr('金額必須大於 0');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fromId = direction === 'DEPOSIT' ? sourceAgent.id : targetAgent.id;
      const toId = direction === 'DEPOSIT' ? targetAgent.id : sourceAgent.id;
      await adminApi.post('/transfers/agent-to-agent', {
        fromId,
        toId,
        amount,
        description: description || undefined,
      });
      if (me && (me.id === sourceAgent.id || me.id === targetAgent.id)) {
        const res = await adminApi.get<AgentPublic>('/auth/me');
        setAgent(res.data);
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (s: string): string => {
    const n = Number.parseFloat(s);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const predict = (balance: string, pays: boolean): string => {
    const b = Number.parseFloat(balance);
    const a = Number.parseFloat(amount);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return fmt(balance);
    return fmt((pays ? b - a : b + a).toString());
  };

  const fromPays = direction === 'DEPOSIT';
  const payerName = fromPays ? sourceAgent.username : targetAgent.username;
  const payerBalance = fromPays ? sourceBalance : targetBalance;
  const payerAfter = predict(payerBalance, true);
  const receiverName = fromPays ? targetAgent.username : sourceAgent.username;
  const receiverBalance = fromPays ? targetBalance : sourceBalance;
  const receiverAfter = predict(receiverBalance, false);
  const amountReady = Number.parseFloat(amount) > 0;

  return (
    <Modal open={open} onClose={onClose} title="代理間轉帳" subtitle={`目標代理 · ${targetAgent.username}`} width="lg">
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-5">
        <div className="border-b border-[#134A54]/50 bg-[#0F2D35] px-4 py-4 text-white sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] text-[#92D7E2]">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                TRANSFER DESK
              </div>
              <div className="mt-2 break-words text-[18px] font-black leading-tight sm:text-[22px]">
                {fromPays ? '操作代理存入目標代理' : '目標代理提領回操作代理'}
              </div>
              <div className="mt-1 text-[12px] text-white/65">
                目標已依列表選取鎖定，右側會即時預估雙方轉後餘額。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
              <BalanceTile label="操作代理" username={sourceAgent.username} balance={fmt(sourceBalance)} tone="light" />
              <BalanceTile label="目標代理" username={targetAgent.username} balance={fmt(targetBalance)} tone="muted" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-[8px] border border-[#D6DEE4] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
            <SectionHeading index="01" title="轉帳方向" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DirectionOption
                icon={<ArrowDownToLine className="h-5 w-5" aria-hidden="true" />}
                title="存入目標"
                detail="操作代理扣款，目標代理加點"
                checked={direction === 'DEPOSIT'}
                tone="deposit"
                onChange={() => setDirection('DEPOSIT')}
              />
              <DirectionOption
                icon={<ArrowUpFromLine className="h-5 w-5" aria-hidden="true" />}
                title="提領回本"
                detail="目標代理扣款，操作代理加點"
                checked={direction === 'WITHDRAW'}
                tone="withdraw"
                onChange={() => setDirection('WITHDRAW')}
              />
            </div>
          </section>

          <section className="rounded-[8px] border border-[#D6DEE4] bg-[#F8FBFC] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
            <SectionHeading index="02" title="目標與金額" />
            <div className="mt-3 space-y-4">
              <div className="rounded-[8px] border border-[#186073]/25 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-400">已鎖定目標</div>
                    <div className="mt-1 truncate font-mono text-[15px] font-black text-ink-900">{targetAgent.username}</div>
                    <div className="mt-1 data-num text-[12px] text-[#186073]">目前 {fmt(targetBalance)}</div>
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="term-input h-14 pl-10 font-mono text-[24px] font-semibold"
                    placeholder="0.00"
                  />
                </div>
              </label>

              <label className="block">
                <div className="label mb-2">備註</div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
            <PreviewAccount label="扣款方" username={payerName} before={fmt(payerBalance)} after={amountReady ? payerAfter : '—'} tone="danger" />
            <div className="flex justify-center">
              <div className="grid h-9 w-9 place-items-center rounded-full border border-[#186073]/25 bg-white text-[#186073]">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <PreviewAccount label="收款方" username={receiverName} before={fmt(receiverBalance)} after={amountReady ? receiverAfter : '—'} tone="success" />
          </div>

          <div className="mt-4 rounded-[8px] border border-[#D4AF37]/35 bg-[#FFF8DA] p-3 text-[11px] leading-relaxed text-[#6D5716]">
            {loadingBalances ? '正在同步最新餘額，仍可先輸入金額。' : '提交後會直接寫入代理轉帳紀錄，並同步更新雙方餘額。'}
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
        <button type="button" onClick={submit} disabled={busy} className="btn-acid inline-flex items-center justify-center gap-2">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          {busy ? '處理中' : '確認轉帳'}
        </button>
      </div>
    </Modal>
  );
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
  icon,
  title,
  detail,
  checked,
  tone,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  tone: 'deposit' | 'withdraw';
  onChange: () => void;
}): JSX.Element {
  const activeClass = tone === 'deposit'
    ? 'border-[#2BAA6A] bg-[#EFFAF4] text-[#15663E]'
    : 'border-[#D4574A] bg-[#FDF0EE] text-[#9D3028]';
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[8px] border bg-white p-3 transition ${checked ? activeClass : 'border-[#D6DEE4] text-ink-700 hover:border-[#186073]/45'}`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
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
