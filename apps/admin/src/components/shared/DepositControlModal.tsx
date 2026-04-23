import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function DepositControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [memberUsername, setMemberUsername] = useState('');
  const [depositAmount, setDepositAmount] = useState('1000');
  const [controlWinRate, setControlWinRate] = useState('0.70');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 自動抓的會員當前餘額 */
  const [memberBalance, setMemberBalance] = useState<string | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      setMemberUsername('');
      setDepositAmount('1000');
      setControlWinRate('0.70');
      setNotes('');
      setMemberBalance(null);
      setMemberLoaded(false);
      setErr(null);
    }
  }, [open]);

  // 目標贏額 = 本次入金 × 1.5（參考系統慣例，readonly）
  const targetProfitNum = (() => {
    const n = Number.parseFloat(depositAmount);
    return Number.isFinite(n) ? n * 1.5 : 0;
  })();

  const lookupMember = async (): Promise<void> => {
    if (!memberUsername.trim()) return;
    setErr(null);
    try {
      const res = await adminApi.get<{ id: string; username: string; balance?: string }>('/members/lookup', {
        params: { username: memberUsername.trim() },
      });
      // lookup 只回 id/username；再拉詳情拿餘額
      const detail = await adminApi.get<{ id: string; balance: string }>(`/members/${res.data.id}`);
      setMemberBalance(detail.data.balance);
      setMemberLoaded(true);
    } catch (e) {
      setMemberLoaded(false);
      setMemberBalance(null);
      setErr(extractApiError(e).message);
    }
  };

  const submit = async (): Promise<void> => {
    if (!memberLoaded || !memberBalance) {
      setErr('請先搜尋會員（確認餘額）');
      return;
    }
    const memberId = await (async () => {
      try {
        const res = await adminApi.get<{ id: string }>('/members/lookup', {
          params: { username: memberUsername.trim() },
        });
        return res.data.id;
      } catch {
        return null;
      }
    })();
    if (!memberId) {
      setErr('找不到會員');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/deposit', {
        memberId,
        memberUsername: memberUsername.trim(),
        depositAmount,
        targetProfit: targetProfitNum.toFixed(2),
        startBalance: memberBalance,
        controlWinRate,
        notes: notes || undefined,
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="新增入金控制" subtitle="Deposit Control" width="md">
      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">會員帳號</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={memberUsername}
              onChange={(e) => {
                setMemberUsername(e.target.value);
                setMemberLoaded(false);
                setMemberBalance(null);
              }}
              className="term-input font-mono flex-1"
              placeholder="輸入會員帳號後按「查詢」"
            />
            <button type="button" onClick={() => void lookupMember()} className="btn-teal-outline text-[11px]">
              查詢
            </button>
          </div>
          {memberLoaded && memberBalance && (
            <div className="mt-2 rounded-[6px] border border-[#186073]/30 bg-[#186073]/5 px-3 py-2 text-[11px] text-[#186073]">
              會員當前餘額 <span className="data-num ml-1 font-bold">{memberBalance}</span>
            </div>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">本次入金</div>
            <input
              type="text"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="term-input font-mono"
              placeholder="1000"
            />
          </label>
          <label className="block">
            <div className="label mb-2">目標贏額（入金×1.5，自動）</div>
            <input
              type="text"
              value={targetProfitNum.toFixed(2)}
              readOnly
              className="term-input font-mono bg-white/[0.05] cursor-not-allowed"
            />
          </label>
        </div>

        <label className="block">
          <div className="label mb-2">觸發後控制勝率（0-1）</div>
          <input
            type="text"
            value={controlWinRate}
            onChange={(e) => setControlWinRate(e.target.value)}
            className="term-input font-mono"
            placeholder="0.70"
          />
        </label>

        <label className="block">
          <div className="label mb-2">備註</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="term-input"
          />
        </label>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy || !memberLoaded} className="btn-acid">
            → 建立
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
