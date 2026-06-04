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
  const [controlWinRatePercent, setControlWinRatePercent] = useState('70');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMember(null);
      setDepositAmount('1000');
      setControlWinRatePercent('70');
      setNotes('');
      setErr(null);
    }
  }, [open]);

  // 目标赢额 = 本次入金 × 1.5（参考系统惯例，readonly）
  const targetProfitNum = (() => {
    const n = Number.parseFloat(depositAmount);
    return Number.isFinite(n) ? n * 1.5 : 0;
  })();
  const memberBalanceNum = Number.parseFloat(member?.balance ?? '0');
  const startBalanceNum = Number.isFinite(memberBalanceNum) ? memberBalanceNum : 0;
  const targetBalanceNum = startBalanceNum + targetProfitNum;

  const submit = async (): Promise<void> => {
    if (!member?.balance) {
      setErr('请先从搜索选单选择会员');
      return;
    }
    const ratePercent = Number.parseFloat(controlWinRatePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 10 || ratePercent > 100) {
      setErr('触发后控制胜率请输入 10-100');
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
        controlWinRate: (ratePercent / 100).toFixed(4),
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

        <div className="grid grid-cols-2 gap-3 rounded-md border border-[#D7B963]/45 bg-[#FFF8DF] p-3 md:grid-cols-4">
          <AmountPreview label="目前余额" value={member ? fmtAmount(startBalanceNum) : '—'} />
          <AmountPreview label="目标赢额" value={fmtAmount(targetProfitNum)} accent="gold" />
          <AmountPreview label="目标余额" value={member ? fmtAmount(targetBalanceNum) : '—'} />
          <AmountPreview label="控制胜率" value={`${controlWinRatePercent || '0'}%`} accent="green" />
        </div>

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
          <div className="label mb-2">触发后控制胜率（10-100%）</div>
          <input
            type="text"
            value={controlWinRatePercent}
            onChange={(e) => setControlWinRatePercent(e.target.value)}
            className="term-input font-mono"
            placeholder="70"
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

function AmountPreview({
  label,
  value,
  accent = 'ink',
}: {
  label: string;
  value: string;
  accent?: 'ink' | 'gold' | 'green';
}) {
  const valueClass =
    accent === 'gold' ? 'text-[#AE8B35]' : accent === 'green' ? 'text-[#12813A]' : 'text-ink-900';
  return (
    <div>
      <div className="label text-[10px] text-ink-500">{label}</div>
      <div className={`mt-1 truncate font-mono text-[15px] font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function fmtAmount(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
