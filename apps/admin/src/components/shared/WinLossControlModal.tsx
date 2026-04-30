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

export function WinLossControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<ControlMode>('SINGLE_MEMBER');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [pct, setPct] = useState('70');
  const [startPeriod, setStartPeriod] = useState('');
  const [winControl, setWinControl] = useState(true);
  const [lossControl, setLossControl] = useState(false);
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
        winControl,
        lossControl,
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
    <Modal open={open} onClose={onClose} title="新增输赢控制" subtitle="按比例翻转输赢" width="md">
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
            <div className="label mb-2">控制百分比（%）</div>
            <input
              type="text"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="term-input font-mono"
              placeholder="50-100"
            />
          </label>
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
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={winControl}
              onChange={(e) => setWinControl(e.target.checked)}
            />
            放水（将输翻成赢）
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={lossControl}
              onChange={(e) => setLossControl(e.target.checked)}
            />
            杀分（将赢翻成输）
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
