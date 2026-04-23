import { useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type ControlMode = 'SINGLE_MEMBER' | 'AGENT_LINE';

export function WinLossControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<ControlMode>('SINGLE_MEMBER');
  const [targetType, setTargetType] = useState<'agent' | 'member'>('member');
  const [targetUsername, setTargetUsername] = useState('');
  const [pct, setPct] = useState('70');
  const [winControl, setWinControl] = useState(true);
  const [lossControl, setLossControl] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!targetUsername.trim()) {
      setErr('请填目标账号');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // 先查對應帳號的 id（依 targetType 查 agent 或 member）
      const endpoint = targetType === 'agent' ? '/agents/lookup' : '/members/lookup';
      const lookup = await adminApi.get<{ id: string; username: string }>(endpoint, {
        params: { username: targetUsername.trim() },
      });
      await adminApi.post('/controls/win-loss', {
        controlMode: mode,
        targetType,
        targetId: lookup.data.id,
        targetUsername: lookup.data.username,
        controlPercentage: pct,
        winControl,
        lossControl,
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
              const next = e.target.value as ControlMode;
              setMode(next);
              // agent_line 模式只能针对代理，single_member 只能针对会员
              setTargetType(next === 'AGENT_LINE' ? 'agent' : 'member');
            }}
            className="term-input"
          >
            <option value="SINGLE_MEMBER">单一会员</option>
            <option value="AGENT_LINE">整条代理线</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">目标类型</div>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as 'agent' | 'member')}
              className="term-input"
            >
              <option value="member">会员</option>
              <option value="agent">代理</option>
            </select>
          </label>
          <label className="block">
            <div className="label mb-2">目标账号</div>
            <input
              type="text"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              className="term-input font-mono"
              placeholder="账号"
            />
          </label>
        </div>

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
