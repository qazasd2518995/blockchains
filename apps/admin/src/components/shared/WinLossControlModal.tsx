import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type ControlMode = 'SINGLE_MEMBER' | 'AGENT_LINE';
type ControlDirection = 'loss' | 'win';

export function WinLossControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<ControlMode>('SINGLE_MEMBER');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [pct, setPct] = useState('70');
  const [targetBitePct, setTargetBitePct] = useState('50');
  const [startPeriod, setStartPeriod] = useState('');
  const [direction, setDirection] = useState<ControlDirection>('loss');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!target) {
      setErr('请先从搜索选单选择目标账号');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const targetType = mode === 'AGENT_LINE' ? 'agent' : 'member';
      await adminApi.post('/controls/win-loss', {
        controlMode: mode,
        targetType,
        targetId: target.id,
        targetUsername: target.username,
        controlPercentage: pct,
        targetBitePercentage: direction === 'loss' ? targetBitePct : undefined,
        winControl: direction === 'win',
        lossControl: direction === 'loss',
        startPeriod: startPeriod.trim() || undefined,
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
      title="新增输赢控制"
      subtitle="未命中介入率时自然开奖；咬分会按目标金额慢慢停止"
      width="md"
    >
      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">控制模式</div>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ControlMode);
              setTarget(null);
            }}
            className="term-input"
          >
            <option value="SINGLE_MEMBER">单一会员</option>
            <option value="AGENT_LINE">整条代理线</option>
          </select>
        </label>

        <AccountSearchSelect
          key={mode}
          kind={mode === 'AGENT_LINE' ? 'agent' : 'member'}
          label={mode === 'AGENT_LINE' ? '目标代理账号' : '目标会员账号'}
          value={target}
          onChange={setTarget}
          placeholder={mode === 'AGENT_LINE' ? '输入代理账号或全名' : '输入会员账号或全名'}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">介入机率（%）</div>
            <input
              type="text"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="term-input font-mono"
              placeholder="50-100"
            />
            <div className="mt-1 text-[10px] text-ink-500">
              例如 50 = 约 50% 局数进入控制判断；未命中时自然开奖。
            </div>
          </label>
          <label className="block">
            <div className="label mb-2">目标咬度（%）</div>
            <input
              type="text"
              value={targetBitePct}
              onChange={(e) => setTargetBitePct(e.target.value)}
              disabled={direction !== 'loss'}
              className="term-input font-mono disabled:opacity-50"
              placeholder="例如 50"
            />
            <div className="mt-1 text-[10px] text-ink-500">
              杀分时启用：50 = 以目标账号当前总余额 50% 为咬分目标。
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">起始期号（选填）</div>
            <input
              type="text"
              value={startPeriod}
              onChange={(e) => setStartPeriod(e.target.value)}
              className="term-input font-mono"
              placeholder="例如 20260424001"
            />
          </label>
          <div className="rounded-lg border border-[#D7E3EA] bg-[#F7FAFC] px-3 py-2 text-[11px] text-[#667789]">
            <div className="font-semibold text-[#24586A]">咬法节奏</div>
            <div className="mt-1">系统会按 3 输 1 赢或 4 输 1 赢释放，不会每局强制。</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-[#D7E3EA] bg-white px-3 py-2 text-[12px]">
            <input
              type="radio"
              name="win-loss-direction"
              checked={direction === 'loss'}
              onChange={() => setDirection('loss')}
            />
            <span>
              <span className="block font-semibold text-[#8A352F]">咬会员 / 上级收</span>
              <span className="block text-[#667789]">慢慢让会员往下</span>
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[#D7E3EA] bg-white px-3 py-2 text-[12px]">
            <input
              type="radio"
              name="win-loss-direction"
              checked={direction === 'win'}
              onChange={() => setDirection('win')}
            />
            <span>
              <span className="block font-semibold text-[#0F766E]">放会员 / 上级付</span>
              <span className="block text-[#667789]">慢慢让会员往上</span>
            </span>
          </label>
        </div>

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
