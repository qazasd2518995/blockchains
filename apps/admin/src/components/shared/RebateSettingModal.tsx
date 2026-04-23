import { useState, useEffect } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentUsername: string;
  onDone: () => void;
}

interface AgentDetail {
  id: string;
  username: string;
  rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  rebatePercentage: string;
  maxRebatePercentage: string;
}

export function RebateSettingModal({ open, onClose, agentId, agentUsername, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<'PERCENTAGE' | 'ALL' | 'NONE'>('PERCENTAGE');
  const [pct, setPct] = useState('0');
  const [maxPct, setMaxPct] = useState('100');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    (async () => {
      try {
        const res = await adminApi.get<AgentDetail>(`/agents/${agentId}`);
        setMode(res.data.rebateMode);
        setPct(res.data.rebatePercentage);
        setMaxPct(res.data.maxRebatePercentage);
      } catch (e) {
        setErr(extractApiError(e).message);
      }
    })();
  }, [open, agentId]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.put(`/agents/${agentId}/rebate`, {
        rebateMode: mode,
        rebatePercentage: pct,
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
    <Modal open={open} onClose={onClose} title="退水設定" subtitle={`Agent · ${agentUsername}`} width="sm">
      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">目前模式</span>
          <span className="font-mono">{mode}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-ink-500">上限（上級）</span>
          <span className="data-num text-[#186073]">{maxPct}%</span>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">退水模式</div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'PERCENTAGE' | 'ALL' | 'NONE')}
            className="term-input"
          >
            <option value="PERCENTAGE">PERCENTAGE（按比例）</option>
            <option value="ALL">ALL（上級全收）</option>
            <option value="NONE">NONE（不給）</option>
          </select>
        </label>

        {mode === 'PERCENTAGE' && (
          <label className="block">
            <div className="label mb-2">退水比例（%，不得超過上限）</div>
            <input
              type="text"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="term-input font-mono"
              placeholder="0.5"
            />
          </label>
        )}

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy} className="btn-acid">
            → 保存
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
