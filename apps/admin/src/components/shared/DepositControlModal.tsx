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
  const [scope, setScope] = useState<'MEMBER' | 'AGENT_LINE'>('MEMBER');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [steps, setSteps] = useState<string[]>(['120', '80', '100', '30', '0']);
  const [controlWinRatePercent, setControlWinRatePercent] = useState('50');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('MEMBER');
      setTarget(null);
      setSteps(['120', '80', '100', '30', '0']);
      setControlWinRatePercent('50');
      setNotes('');
      setErr(null);
    }
  }, [open]);

  const targetBalanceNum = Number.parseFloat(target?.balance ?? '0');
  const principalNum = Number.isFinite(targetBalanceNum) ? targetBalanceNum : 0;
  const parsedSteps = steps
    .map((step) => Number.parseFloat(step))
    .filter((step) => Number.isFinite(step) && step >= 0);
  const firstStep = parsedSteps[0];
  const firstTargetBalance =
    scope === 'MEMBER' && firstStep !== undefined ? principalNum * (firstStep / 100) : null;

  const submit = async (): Promise<void> => {
    if (!target) {
      setErr(scope === 'AGENT_LINE' ? '请先选择代理线账号' : '请先选择会员账号');
      return;
    }
    if (parsedSteps.length === 0 || parsedSteps.length !== steps.length) {
      setErr('阶段百分比必须是 0 以上数字');
      return;
    }
    const ratePercent = Number.parseFloat(controlWinRatePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      setErr('介入率请输入 0-100');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post('/controls/deposit', {
        scope,
        memberId: scope === 'MEMBER' ? target.id : undefined,
        memberUsername: scope === 'MEMBER' ? target.username : undefined,
        targetAgentId: scope === 'AGENT_LINE' ? target.id : undefined,
        targetAgentUsername: scope === 'AGENT_LINE' ? target.username : undefined,
        depositAmount: scope === 'MEMBER' ? principalNum.toFixed(2) : '0',
        targetProfit: '0',
        startBalance: scope === 'MEMBER' ? principalNum.toFixed(2) : '0',
        controlWinRate: (ratePercent / 100).toFixed(4),
        lifecycleSteps: parsedSteps,
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
    <Modal
      open={open}
      onClose={onClose}
      title="新增入金控制"
      subtitle="按本金百分比建立玩家生命周期，命中介入率时朝当前阶段目标控制"
      width="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.85fr_1.4fr]">
          <label className="block">
            <div className="label mb-2">控制范围</div>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as 'MEMBER' | 'AGENT_LINE');
                setTarget(null);
              }}
              className="term-input"
            >
              <option value="MEMBER">单一会员</option>
              <option value="AGENT_LINE">整条代理线</option>
            </select>
          </label>
          <AccountSearchSelect
            key={scope}
            kind={scope === 'AGENT_LINE' ? 'agent' : 'member'}
            label={scope === 'AGENT_LINE' ? '代理线账号' : '会员账号'}
            value={target}
            onChange={setTarget}
            placeholder={scope === 'AGENT_LINE' ? '输入代理账号或全名' : '输入会员账号或全名'}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-[#D7B963]/45 bg-[#FFF8DF] p-3 md:grid-cols-4">
          <AmountPreview
            label={scope === 'AGENT_LINE' ? '代理线本金' : '目前本金'}
            value={
              scope === 'AGENT_LINE' ? '各会员首次下注余额' : target ? fmtAmount(principalNum) : '—'
            }
          />
          <AmountPreview
            label="第一阶段"
            value={parsedSteps.length > 0 ? `${parsedSteps[0]}%` : '—'}
            accent="gold"
          />
          <AmountPreview
            label="第一目标额"
            value={
              scope === 'MEMBER' && firstTargetBalance !== null
                ? fmtAmount(firstTargetBalance)
                : '各会员独立'
            }
          />
          <AmountPreview label="介入率" value={`${controlWinRatePercent || '0'}%`} accent="green" />
        </div>

        <label className="block">
          <div className="label mb-2">本金生命周期阶段</div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#D5DEE4] bg-white p-3">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && <span className="text-[12px] text-ink-400">»</span>}
                <div className="flex items-center rounded-md border border-[#D5DEE4] bg-[#F7FAFB]">
                  <input
                    type="text"
                    value={step}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    className="w-20 bg-transparent px-3 py-2 text-center font-mono text-[13px] outline-none"
                    placeholder="80"
                  />
                  <span className="pr-2 text-[11px] text-ink-500">%</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    disabled={steps.length <= 1}
                    className="border-l border-[#D5DEE4] px-2 py-2 text-[11px] text-[#D4574A] disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSteps((current) => [...current, '0'])}
              className="btn-teal-outline px-3 py-2 text-[11px]"
            >
              + 阶段
            </button>
          </div>
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <div className="label mb-2">介入率（0-100%）</div>
            <input
              type="text"
              value={controlWinRatePercent}
              onChange={(e) => setControlWinRatePercent(e.target.value)}
              className="term-input font-mono"
              placeholder="50"
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
        </div>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy || !target} className="btn-acid">
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
