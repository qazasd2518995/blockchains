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

/** 後端以 fraction 儲存（0.0410 = 4.10%），UI 一律顯示 % */
function fractionToPctStr(f: string): string {
  const n = Number.parseFloat(f);
  if (!Number.isFinite(n)) return '0.00';
  return (n * 100).toFixed(2);
}

function pctStrToFraction(p: string): string {
  const n = Number.parseFloat(p);
  if (!Number.isFinite(n)) return '0';
  return (n / 100).toFixed(4);
}

export function RebateSettingModal({ open, onClose, agentId, agentUsername, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<'PERCENTAGE' | 'ALL' | 'NONE'>('PERCENTAGE');
  /** 以 % 為單位顯示（字串，例如 "4.10"） */
  const [pctDisplay, setPctDisplay] = useState('0.00');
  const [maxPctDisplay, setMaxPctDisplay] = useState('0.00');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    (async () => {
      try {
        const res = await adminApi.get<AgentDetail>(`/agents/${agentId}`);
        setMode(res.data.rebateMode);
        setPctDisplay(fractionToPctStr(res.data.rebatePercentage));
        setMaxPctDisplay(fractionToPctStr(res.data.maxRebatePercentage));
      } catch (e) {
        setErr(extractApiError(e).message);
      }
    })();
  }, [open, agentId]);

  const submit = async (): Promise<void> => {
    // 前端先做基本校驗避免後端 422
    const pctNum = Number.parseFloat(pctDisplay);
    const maxNum = Number.parseFloat(maxPctDisplay);
    if (mode === 'PERCENTAGE') {
      if (!Number.isFinite(pctNum) || pctNum < 0) {
        setErr('退水比例必須為非負數字（%）');
        return;
      }
      if (pctNum > maxNum + 1e-6) {
        setErr(`退水比例不可超過上限 ${maxPctDisplay}%`);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.put(`/agents/${agentId}/rebate`, {
        rebateMode: mode,
        rebatePercentage: pctStrToFraction(pctDisplay),
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
          <span className="data-num text-[#186073]">{maxPctDisplay}%</span>
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
            <div className="label mb-2">退水比例（%，不得超過 {maxPctDisplay}%）</div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={pctDisplay}
                onChange={(e) => setPctDisplay(e.target.value)}
                className="term-input font-mono pr-8"
                placeholder="例如 2.50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-500">
                %
              </span>
            </div>
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
