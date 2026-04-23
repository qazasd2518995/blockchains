import { useState } from 'react';
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
  const [targetProfit, setTargetProfit] = useState('500');
  const [startBalance, setStartBalance] = useState('1000');
  const [controlWinRate, setControlWinRate] = useState('0.70');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!memberUsername.trim()) {
      setErr('請填會員帳號');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const lookup = await adminApi.get<{ id: string; username: string }>('/members/lookup', {
        params: { username: memberUsername.trim() },
      });
      await adminApi.post('/controls/deposit', {
        memberId: lookup.data.id,
        memberUsername: lookup.data.username,
        depositAmount,
        targetProfit,
        startBalance,
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
          <input
            type="text"
            value={memberUsername}
            onChange={(e) => setMemberUsername(e.target.value)}
            className="term-input font-mono"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">本次入金</div>
            <input
              type="text"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">目標贏額（後翻輸）</div>
            <input
              type="text"
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">起始餘額</div>
            <input
              type="text"
              value={startBalance}
              onChange={(e) => setStartBalance(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">控制勝率（0-1）</div>
            <input
              type="text"
              value={controlWinRate}
              onChange={(e) => setControlWinRate(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>
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
          <button type="button" onClick={submit} disabled={busy} className="btn-acid">
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
