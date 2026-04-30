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
  const [burstRate, setBurstRate] = useState('2');
  const [minBurstProfit, setMinBurstProfit] = useState('200');
  const [maxBurstProfit, setMaxBurstProfit] = useState('3000');
  const [dailyBudget, setDailyBudget] = useState('30000');
  const [memberDailyCap, setMemberDailyCap] = useState('5000');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('ALL');
      setTarget(null);
      setBurstRate('2');
      setMinBurstProfit('200');
      setMaxBurstProfit('3000');
      setDailyBudget('30000');
      setMemberDailyCap('5000');
      setNotes('');
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
        burstRate,
        minBurstProfit,
        maxBurstProfit,
        dailyBudget,
        memberDailyCap,
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
    <Modal open={open} onClose={onClose} title="新增爆分控制" subtitle="简单爆分池" width="lg">
      <div className="space-y-4">
        <div className="rounded-[6px] border border-[#186073]/20 bg-[#186073]/5 p-3 text-[12px] text-[#334155]">
          只需要设定爆分机率、单次净赢范围与每日池。系统会自动套用会员上限、剩余池检查、8 局冷却与风险防守，避免连续爆分或单次派彩失控。
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

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="爆分机率（%）" value={burstRate} onChange={setBurstRate} hint="例如 2 = 2%，也可输入 0.02" />
          <Field label="每日爆分总池" value={dailyBudget} onChange={setDailyBudget} hint="今日所有爆分净赢合计不可超过此金额" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="单次最小净赢" value={minBurstProfit} onChange={setMinBurstProfit} />
          <Field label="单次最大净赢" value={maxBurstProfit} onChange={setMaxBurstProfit} />
          <Field label="单会员每日上限" value={memberDailyCap} onChange={setMemberDailyCap} />
        </div>

        <div className="rounded-[6px] border border-[#D4AF37]/30 bg-[#FFF8DA] p-3 text-[12px] text-[#6D5716]">
          <div className="font-semibold">自动护栏</div>
          <div className="mt-1">
            单次爆分会被限制在净赢范围内；若每日池或会员上限不足，会自动停止爆分。会员达到上限后，高倍自然结果会被压到可控小赢或输局。
          </div>
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
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="term-input font-mono"
      />
      {hint && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </label>
  );
}
