import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: 'agent' | 'member';
  targetId: string;
  targetUsername: string;
  currentLevel: string;
  onDone: () => void;
}

type LimitLevel = 'level1' | 'level2' | 'level3' | 'level4' | 'level5' | 'unlimited';

interface LevelConfig {
  value: LimitLevel;
  label: string;
  perBet: string;
  perDay: string;
  description: string;
}

const LEVELS: LevelConfig[] = [
  {
    value: 'level1',
    label: '新手',
    perBet: '100',
    perDay: '500',
    description: '单注上限 100，单日上限 500。适合刚注册的新玩家练习。',
  },
  {
    value: 'level2',
    label: '一般',
    perBet: '500',
    perDay: '3,000',
    description: '单注上限 500，单日上限 3,000。适合一般休閒玩家。',
  },
  {
    value: 'level3',
    label: '标准',
    perBet: '2,000',
    perDay: '10,000',
    description: '单注上限 2,000，单日上限 10,000。预设标准等级。',
  },
  {
    value: 'level4',
    label: '进阶',
    perBet: '10,000',
    perDay: '50,000',
    description: '单注上限 10,000，单日上限 50,000。适合活跃玩家。',
  },
  {
    value: 'level5',
    label: 'VIP',
    perBet: '50,000',
    perDay: '200,000',
    description: '单注上限 50,000，单日上限 200,000。适合高额玩家。',
  },
  {
    value: 'unlimited',
    label: '不限',
    perBet: '∞',
    perDay: '∞',
    description: '无额度限制。仅代理/会员具备信任关系时才开放。',
  },
];

function normaliseLevel(raw: string): LimitLevel {
  const match = LEVELS.find((l) => l.value === raw);
  return (match?.value ?? 'level3') as LimitLevel;
}

export function BettingLimitModal({
  open,
  onClose,
  targetType,
  targetId,
  targetUsername,
  currentLevel,
  onDone,
}: Props): JSX.Element {
  const [selected, setSelected] = useState<LimitLevel>(normaliseLevel(currentLevel));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(normaliseLevel(currentLevel));
    setErr(null);
  }, [open, currentLevel]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const path = targetType === 'agent'
        ? `/agents/${targetId}/betting-limit`
        : `/members/${targetId}/betting-limit`;
      await adminApi.patch(path, { bettingLimitLevel: selected });
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const currentConfig = LEVELS.find((l) => l.value === normaliseLevel(currentLevel));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="限红设定"
      subtitle={`${targetType === 'agent' ? 'Agent' : 'Member'} · ${targetUsername}`}
      width="md"
    >
      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">当前等级</span>
          <span className="font-mono text-[#186073]">
            {currentConfig ? `${currentConfig.label} · ${currentConfig.value}` : currentLevel}
          </span>
        </div>
        {currentConfig && (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-ink-500">单注 / 单日</span>
            <span className="font-mono text-ink-700">
              {currentConfig.perBet} / {currentConfig.perDay}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="label mb-1">选择限红等级</div>
        {LEVELS.map((lvl) => {
          const active = selected === lvl.value;
          return (
            <label
              key={lvl.value}
              className={`block cursor-pointer border p-3 transition ${
                active
                  ? 'border-[#186073] bg-[#E6F2F4]'
                  : 'border-ink-200 bg-white hover:border-ink-400'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="betting-limit-level"
                  value={lvl.value}
                  checked={active}
                  onChange={() => setSelected(lvl.value)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[13px] text-ink-900">{lvl.label}</span>
                      <span className="font-mono text-[10px] text-ink-500">{lvl.value}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#186073]">
                      单注 {lvl.perBet} · 单日 {lvl.perDay}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ink-500">
                    {lvl.description}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {err && (
        <div className="mt-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {err}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="btn-acid">
          → 保存
        </button>
        <button type="button" onClick={onClose} className="btn-teal-outline">
          [取消]
        </button>
      </div>
    </Modal>
  );
}
