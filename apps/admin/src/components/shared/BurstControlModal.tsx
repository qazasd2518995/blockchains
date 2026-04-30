import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type Scope = 'ALL' | 'AGENT_LINE' | 'MEMBER';

export function BurstControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [scope, setScope] = useState<Scope>('ALL');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [dailyBudget, setDailyBudget] = useState('50000');
  const [memberDailyCap, setMemberDailyCap] = useState('5000');
  const [singlePayoutCap, setSinglePayoutCap] = useState('3000');
  const [singleMultiplierCap, setSingleMultiplierCap] = useState('100');
  const [minBurstMultiplier, setMinBurstMultiplier] = useState('8');
  const [smallWinMultiplier, setSmallWinMultiplier] = useState('1.5');
  const [burstRate, setBurstRate] = useState('0.03');
  const [smallWinRate, setSmallWinRate] = useState('0.35');
  const [lossRate, setLossRate] = useState('0.45');
  const [compensationLoss, setCompensationLoss] = useState('500');
  const [riskWinLimit, setRiskWinLimit] = useState('1000');
  const [cooldownRounds, setCooldownRounds] = useState('8');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('ALL');
      setTarget(null);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const resolveTarget = async (): Promise<{
    targetAgentId?: string;
    targetAgentUsername?: string;
    targetMemberId?: string;
    targetMemberUsername?: string;
  }> => {
    if (scope === 'ALL') return {};
    if (!target) {
      throw new Error(scope === 'AGENT_LINE' ? '请先选择目标代理账号' : '请先选择目标会员账号');
    }
    return scope === 'AGENT_LINE'
      ? { targetAgentId: target.id, targetAgentUsername: target.username }
      : { targetMemberId: target.id, targetMemberUsername: target.username };
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const target = await resolveTarget();
      await adminApi.post('/controls/burst', {
        scope,
        ...target,
        dailyBudget,
        memberDailyCap,
        singlePayoutCap,
        singleMultiplierCap,
        minBurstMultiplier,
        smallWinMultiplier,
        burstRate,
        smallWinRate,
        lossRate,
        compensationLoss,
        riskWinLimit,
        cooldownRounds: Number.parseInt(cooldownRounds, 10),
        notes: notes || undefined,
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
    <Modal open={open} onClose={onClose} title="新增爆分控制" subtitle="爆分池与娱乐曲线" width="lg">
      <div className="space-y-4">
        <div className="rounded-[6px] border border-[#186073]/20 bg-[#186073]/5 p-3 text-[12px] text-[#334155]">
          系统会先看强制输赢、封顶、入金与手动侦测；都没有命中时，才用这组参数让会员在小赢、小输与偶尔爆分之间循环。
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="label mb-2">控制范围</div>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as Scope);
                setTarget(null);
              }}
              className="term-input"
            >
              <option value="ALL">全盘</option>
              <option value="AGENT_LINE">代理线</option>
              <option value="MEMBER">单一会员</option>
            </select>
          </label>
          {scope !== 'ALL' && (
            <AccountSearchSelect
              key={scope}
              kind={scope === 'AGENT_LINE' ? 'agent' : 'member'}
              label={scope === 'AGENT_LINE' ? '目标代理账号' : '目标会员账号'}
              value={target}
              onChange={setTarget}
              placeholder={scope === 'AGENT_LINE' ? '输入代理账号或全名' : '输入会员账号或全名'}
            />
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="每日爆分池" value={dailyBudget} onChange={setDailyBudget} />
          <Field label="单会员每日上限" value={memberDailyCap} onChange={setMemberDailyCap} />
          <Field label="单局最高派彩" value={singlePayoutCap} onChange={setSinglePayoutCap} />
          <Field label="单局最高倍率" value={singleMultiplierCap} onChange={setSingleMultiplierCap} />
          <Field label="爆分最低倍率" value={minBurstMultiplier} onChange={setMinBurstMultiplier} />
          <Field label="小赢倍率" value={smallWinMultiplier} onChange={setSmallWinMultiplier} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="爆分机率" value={burstRate} onChange={setBurstRate} hint="0.03 = 3%" />
          <Field label="小赢机率" value={smallWinRate} onChange={setSmallWinRate} hint="0.35 = 35%" />
          <Field label="压输机率" value={lossRate} onChange={setLossRate} hint="0.45 = 45%" />
          <Field label="补偿输额" value={compensationLoss} onChange={setCompensationLoss} />
          <Field label="风险赢额" value={riskWinLimit} onChange={setRiskWinLimit} />
          <Field label="爆分冷却局数" value={cooldownRounds} onChange={setCooldownRounds} />
        </div>

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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="term-input font-mono"
      />
      {hint && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </label>
  );
}
