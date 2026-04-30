import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function DepositControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [member, setMember] = useState<AccountSearchOption | null>(null);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [controlWinRate, setControlWinRate] = useState('0.70');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMember(null);
      setDepositAmount('1000');
      setControlWinRate('0.70');
      setNotes('');
      setErr(null);
    }
  }, [open]);

  // 目标赢额 = 本次入金 × 1.5（参考系统惯例，readonly）
  const targetProfitNum = (() => {
    const n = Number.parseFloat(depositAmount);
    return Number.isFinite(n) ? n * 1.5 : 0;
  })();

  const submit = async (): Promise<void> => {
    if (!member?.balance) {
      setErr('请先从搜索选单选择会员');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/deposit', {
        memberId: member.id,
        memberUsername: member.username,
        depositAmount,
        targetProfit: targetProfitNum.toFixed(2),
        startBalance: member.balance,
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
    <Modal open={open} onClose={onClose} title="新增入金控制" subtitle="依入金目标控制胜率" width="md">
      <div className="space-y-4">
        <AccountSearchSelect
          kind="member"
          label="会员账号"
          value={member}
          onChange={setMember}
          placeholder="输入会员账号或全名"
        />

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
            <div className="label mb-2">目标赢额（入金×1.5，自动）</div>
            <input
              type="text"
              value={targetProfitNum.toFixed(2)}
              readOnly
              className="term-input font-mono bg-white/[0.05] cursor-not-allowed"
            />
          </label>
        </div>

        <label className="block">
          <div className="label mb-2">触发后控制胜率（0-1）</div>
          <input
            type="text"
            value={controlWinRate}
            onChange={(e) => setControlWinRate(e.target.value)}
            className="term-input font-mono"
            placeholder="0.70"
          />
        </label>

        <label className="block">
          <div className="label mb-2">备注</div>
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
          <button type="button" onClick={submit} disabled={busy || !member} className="btn-acid">
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
