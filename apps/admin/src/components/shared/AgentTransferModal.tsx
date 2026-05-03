import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeDollarSign,
  SendHorizontal,
  WalletCards,
  X,
} from 'lucide-react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  fromAgent: { id: string; username: string; balance: string };
  onDone: () => void;
}

type Direction = 'DEPOSIT' | 'WITHDRAW';

/**
 * 代理間轉帳 Modal（參考系統 adjustAgentBalanceModal）
 *   DEPOSIT：本代理 → 目標代理（從本代理扣）
 *   WITHDRAW：目標代理 → 本代理（從目標代理扣）
 */
export function AgentTransferModal({ open, onClose, fromAgent, onDone }: Props): JSX.Element {
  const [direction, setDirection] = useState<Direction>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targetAgent, setTargetAgent] = useState<AccountSearchOption | null>(null);

  useEffect(() => {
    if (!open) {
      setDirection('DEPOSIT');
      setAmount('');
      setDescription('');
      setTargetAgent(null);
      setErr(null);
    }
  }, [open]);

  const fillMax = (): void => {
    // DEPOSIT：從本代理扣 → 以本代理餘額為上限
    // WITHDRAW：從目標代理扣 → 以目標代理餘額為上限
    const source = direction === 'DEPOSIT' ? fromAgent.balance : targetAgent?.balance;
    if (source) setAmount(source);
  };

  const submit = async (): Promise<void> => {
    if (!targetAgent) {
      setErr('請先從搜尋選單選擇目標代理');
      return;
    }
    if (!amount) {
      setErr('請填金額');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // DEPOSIT：from → to（fromAgent 付出）
      // WITHDRAW：to → from（targetAgent 付出）
      const fromId = direction === 'DEPOSIT' ? fromAgent.id : targetAgent.id;
      const toId = direction === 'DEPOSIT' ? targetAgent.id : fromAgent.id;
      await adminApi.post('/transfers/agent-to-agent', {
        fromId,
        toId,
        amount,
        description: description || undefined,
      });
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
  const sourceName = fromPays ? fromAgent.username : (targetAgent?.username ?? '目標代理');
  const sourceBalance = fromPays ? fromAgent.balance : (targetAgent?.balance ?? '0');
  const sourceAfter = fromPays
    ? predict(fromAgent.balance, true)
    : targetAgent ? predict(targetAgent.balance ?? '0', true) : '—';
  const targetName = fromPays ? (targetAgent?.username ?? '目標代理') : fromAgent.username;
  const targetBalance = fromPays ? (targetAgent?.balance ?? '0') : fromAgent.balance;
  const targetAfter = fromPays
    ? targetAgent ? predict(targetAgent.balance ?? '0', false) : '—'
    : predict(fromAgent.balance, false);
  const amountReady = Number.parseFloat(amount) > 0;

  return (
    <Modal open={open} onClose={onClose} title="代理間轉帳" subtitle={`操作端 · ${fromAgent.username}`} width="lg">
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-5">
        <div className="border-b border-[#134A54]/50 bg-[#0F2D35] px-4 py-4 text-white sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.24em] text-[#92D7E2]">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                TRANSFER DESK
              </div>
              <div className="mt-2 break-words text-[18px] font-black leading-tight sm:text-[22px]">
                {fromPays ? '本代理存入目標代理' : '目標代理提領回本代理'}
              </div>
              <div className="mt-1 text-[12px] text-white/65">
                選定目標代理後，右側會即時預估雙方轉後餘額。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
              <BalanceTile label="本代理" username={fromAgent.username} balance={fmt(fromAgent.balance)} tone="light" />
              <BalanceTile
                label="目標代理"
                username={targetAgent?.username ?? '尚未選擇'}
                balance={targetAgent ? fmt(targetAgent.balance ?? '0') : '—'}
                tone="muted"
              />
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
                detail="本代理扣款，目標代理加點"
                checked={direction === 'DEPOSIT'}
                tone="deposit"
                onChange={() => setDirection('DEPOSIT')}
              />
              <DirectionOption
                icon={<ArrowUpFromLine className="h-5 w-5" aria-hidden="true" />}
                title="提領回本"
                detail="目標代理扣款，本代理加點"
                checked={direction === 'WITHDRAW'}
                tone="withdraw"
                onChange={() => setDirection('WITHDRAW')}
              />
            </div>
          </section>

          <section className="rounded-[8px] border border-[#D6DEE4] bg-[#F8FBFC] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
            <SectionHeading index="02" title="目標與金額" />
            <div className="mt-3 space-y-4">
              <AccountSearchSelect
                kind="agent"
                label="目標代理帳號"
                value={targetAgent}
                onChange={(next) => {
                  if (next?.id === fromAgent.id) {
                    setErr('不能轉給自己');
                    setTargetAgent(null);
                    return;
                  }
                  setErr(null);
                  setTargetAgent(next);
                }}
                excludeId={fromAgent.id}
                placeholder="輸入代理帳號或全名"
              />

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
            <PreviewAccount label="扣款方" username={sourceName} before={fmt(sourceBalance)} after={amountReady ? sourceAfter : '—'} tone="danger" />
            <div className="flex justify-center">
              <div className="grid h-9 w-9 place-items-center rounded-full border border-[#186073]/25 bg-white text-[#186073]">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <PreviewAccount label="收款方" username={targetName} before={fmt(targetBalance)} after={amountReady ? targetAfter : '—'} tone="success" />
          </div>

          <div className="mt-4 rounded-[8px] border border-[#D4AF37]/35 bg-[#FFF8DA] p-3 text-[11px] leading-relaxed text-[#6D5716]">
            提交後會直接寫入代理轉帳紀錄，並同步更新雙方餘額。
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
        <button type="button" onClick={submit} disabled={busy || !targetAgent} className="btn-acid inline-flex items-center justify-center gap-2">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          確認轉帳
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
