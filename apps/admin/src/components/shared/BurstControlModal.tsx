import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function BurstControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [member, setMember] = useState<AccountSearchOption | null>(null);
  const [burstAmount, setBurstAmount] = useState('10000');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMember(null);
      setBurstAmount('10000');
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (!member) {
      setErr('请先选择玩家账号');
      return;
    }
    const amount = Number.parseFloat(burstAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('爆分金额必须大于 0');
      return;
    }
    const normalizedAmount = amount.toFixed(2);
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/burst', {
        scope: 'MEMBER',
        targetMemberId: member.id,
        targetMemberUsername: member.username,
        burstRate: '100',
        lossRate: '0',
        smallWinRate: '0',
        minBurstProfit: normalizedAmount,
        maxBurstProfit: normalizedAmount,
        singleMultiplierCap: '50000',
        gameIds: [],
        dailyBudget: normalizedAmount,
        memberDailyCap: normalizedAmount,
        capitalRetentionRatio: '0',
        minEligibilityLoss: '0',
        cooldownRounds: 0,
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="新增爆分控制" subtitle="指定玩家爆分金额" width="md">
      <div className="space-y-4">
        <div className="rounded-[6px] border border-[#186073]/20 bg-[#186073]/5 p-3 text-[12px] text-[#334155]">
          选择玩家并输入爆分金额即可。系统会把该金额作为本次单一玩家的爆分池与单次目标净赢，并仍依各游戏可用结果与派彩规则结算。
        </div>

        <AccountSearchSelect
          kind="member"
          label="玩家账号"
          value={member}
          onChange={setMember}
          placeholder="输入玩家账号或全名"
        />

        <Field
          label="爆分金额"
          value={burstAmount}
          onChange={setBurstAmount}
          hint="例如 10000。玩家下注 10 元时，系统会尝试匹配约 1000 倍的合法派彩结果。"
        />

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-acid">
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

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="label mb-2">{label}</div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="term-input font-mono"
      />
      {hint && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </label>
  );
}
