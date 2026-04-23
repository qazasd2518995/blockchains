import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
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
  const [toUsername, setToUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** lookup 後抓到的目標代理 */
  const [targetAgent, setTargetAgent] = useState<{ id: string; username: string; balance: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setDirection('DEPOSIT');
      setToUsername('');
      setAmount('');
      setDescription('');
      setTargetAgent(null);
      setErr(null);
    }
  }, [open]);

  const lookupTarget = async (): Promise<void> => {
    if (!toUsername.trim()) return;
    setErr(null);
    try {
      const res = await adminApi.get<{ id: string; username: string }>('/agents/lookup', {
        params: { username: toUsername.trim() },
      });
      if (res.data.id === fromAgent.id) {
        setErr('不能轉給自己');
        return;
      }
      const detail = await adminApi.get<{ id: string; username: string; balance: string }>(
        `/agents/${res.data.id}`,
      );
      setTargetAgent(detail.data);
    } catch (e) {
      setTargetAgent(null);
      setErr(extractApiError(e).message);
    }
  };

  const fillMax = (): void => {
    // DEPOSIT：從本代理扣 → 以本代理餘額為上限
    // WITHDRAW：從目標代理扣 → 以目標代理餘額為上限
    const source = direction === 'DEPOSIT' ? fromAgent.balance : targetAgent?.balance;
    if (source) setAmount(source);
  };

  const submit = async (): Promise<void> => {
    if (!targetAgent) {
      setErr('請先查詢目標代理');
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

  return (
    <Modal open={open} onClose={onClose} title="代理間轉帳" subtitle={`操作端 · ${fromAgent.username}`} width="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
          <div>
            <div className="text-ink-500">本代理（{fromAgent.username}）</div>
            <div className="mt-0.5 data-num text-[#186073]">{fmt(fromAgent.balance)}</div>
          </div>
          <div className="text-right">
            <div className="text-ink-500">目標代理（{targetAgent?.username ?? '—'}）</div>
            <div className="mt-0.5 data-num text-[#186073]">
              {targetAgent ? fmt(targetAgent.balance) : '—'}
            </div>
          </div>
        </div>

        <div>
          <div className="label mb-2">轉帳方向</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-toxic has-[:checked]:bg-neon-toxic/10 has-[:checked]:text-win">
              <input
                type="radio"
                value="DEPOSIT"
                checked={direction === 'DEPOSIT'}
                onChange={() => setDirection('DEPOSIT')}
                className="sr-only"
              />
              <span>⇩ 存入（本→目標）</span>
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 border border-ink-200 py-3 text-[11px] tracking-[0.2em] uppercase transition has-[:checked]:border-neon-ember has-[:checked]:bg-neon-ember/10 has-[:checked]:text-[#D4574A]">
              <input
                type="radio"
                value="WITHDRAW"
                checked={direction === 'WITHDRAW'}
                onChange={() => setDirection('WITHDRAW')}
                className="sr-only"
              />
              <span>⇧ 提領（目標→本）</span>
            </label>
          </div>
        </div>

        <label className="block">
          <div className="label mb-2">目標代理帳號</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={toUsername}
              onChange={(e) => {
                setToUsername(e.target.value);
                setTargetAgent(null);
              }}
              className="term-input font-mono flex-1"
              placeholder="輸入帳號後按「查詢」"
            />
            <button type="button" onClick={() => void lookupTarget()} className="btn-teal-outline text-[11px]">
              查詢
            </button>
          </div>
        </label>

        <label className="block">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="label">金額</span>
            <button type="button" onClick={fillMax} className="text-[10px] font-semibold text-[#186073] hover:underline">
              全部餘額
            </button>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="term-input font-mono text-lg"
            placeholder="0.00"
          />
        </label>

        <label className="block">
          <div className="label mb-2">備註</div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="term-input"
          />
        </label>

        {targetAgent && amount && (
          <div className="grid grid-cols-2 gap-2 border border-[#186073]/55 bg-[#FAF2D7]/60 p-3 text-[11px]">
            <div>
              <div className="text-ink-500">本代理轉後</div>
              <div className="mt-0.5 data-num text-[#186073]">{predict(fromAgent.balance, fromPays)}</div>
            </div>
            <div className="text-right">
              <div className="text-ink-500">目標代理轉後</div>
              <div className="mt-0.5 data-num text-[#186073]">{predict(targetAgent.balance, !fromPays)}</div>
            </div>
          </div>
        )}

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy || !targetAgent} className="btn-acid">
            → 確認轉帳
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
