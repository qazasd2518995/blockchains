import { useState, useEffect } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import {
  type RebateMode,
  fractionToPctStr,
  rebateFractionForMode,
} from '@/lib/rebate';

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
  rebateMode: RebateMode;
  rebatePercentage: string;
  maxRebatePercentage: string;
  baccaratRebateMode: RebateMode;
  baccaratRebatePercentage: string;
  maxBaccaratRebatePercentage: string;
}

const rebateModeLabel: Record<RebateMode, string> = {
  PERCENTAGE: '按比例分配',
  ALL: '全拿退水',
  NONE: '全退下级',
};

export function RebateSettingModal({ open, onClose, agentId, agentUsername, onDone }: Props): JSX.Element {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [electronicMode, setElectronicMode] = useState<RebateMode>('PERCENTAGE');
  const [electronicPctDisplay, setElectronicPctDisplay] = useState('0.00');
  const [baccaratMode, setBaccaratMode] = useState<RebateMode>('PERCENTAGE');
  const [baccaratPctDisplay, setBaccaratPctDisplay] = useState('0.00');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setDetail(null);
    void (async () => {
      try {
        const res = await adminApi.get<AgentDetail>(`/agents/${agentId}`);
        const next = res.data;
        setDetail(next);
        const electronicMaxPct = fractionToPctStr(next.maxRebatePercentage);
        const baccaratMaxPct = fractionToPctStr(next.maxBaccaratRebatePercentage);
        setElectronicMode(next.rebateMode);
        setElectronicPctDisplay(
          next.rebateMode === 'NONE' ? electronicMaxPct : fractionToPctStr(next.rebatePercentage),
        );
        setBaccaratMode(next.baccaratRebateMode);
        setBaccaratPctDisplay(
          next.baccaratRebateMode === 'NONE'
            ? baccaratMaxPct
            : fractionToPctStr(next.baccaratRebatePercentage),
        );
      } catch (e) {
        setErr(extractApiError(e).message);
      }
    })();
  }, [open, agentId]);

  const submit = async (): Promise<void> => {
    if (!detail) return;
    const electronicMaxPct = Number.parseFloat(fractionToPctStr(detail.maxRebatePercentage));
    const baccaratMaxPct = Number.parseFloat(fractionToPctStr(detail.maxBaccaratRebatePercentage));
    const electronicPct = Number.parseFloat(electronicPctDisplay);
    const baccaratPct = Number.parseFloat(baccaratPctDisplay);

    if (electronicMode === 'PERCENTAGE') {
      if (!Number.isFinite(electronicPct) || electronicPct < 0) {
        setErr('电子退水比例必须为非负数字（%）');
        return;
      }
      if (electronicPct > electronicMaxPct + 1e-6) {
        setErr(`电子退水比例不可超过上限 ${electronicMaxPct.toFixed(2)}%`);
        return;
      }
    }
    if (baccaratMode === 'PERCENTAGE') {
      if (!Number.isFinite(baccaratPct) || baccaratPct < 0) {
        setErr('百家乐退水比例必须为非负数字（%）');
        return;
      }
      if (baccaratPct > baccaratMaxPct + 1e-6) {
        setErr(`百家乐退水比例不可超过上限 ${baccaratMaxPct.toFixed(2)}%`);
        return;
      }
    }

    setBusy(true);
    setErr(null);
    try {
      await adminApi.put(`/agents/${agentId}/rebate`, {
        rebateMode: electronicMode,
        rebatePercentage: rebateFractionForMode(
          electronicMode,
          electronicPctDisplay,
          electronicMaxPct,
        ),
        baccaratRebateMode: baccaratMode,
        baccaratRebatePercentage: rebateFractionForMode(
          baccaratMode,
          baccaratPctDisplay,
          baccaratMaxPct,
        ),
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
    <Modal open={open} onClose={onClose} title="退水设定" subtitle={`Agent · ${agentUsername}`} width="md">
      <div className="space-y-4">
        <RebateSection
          title="电子退水"
          description="只显示当前层级可往下分配的电子退水额度。"
          mode={electronicMode}
          pctDisplay={electronicPctDisplay}
          maxPctDisplay={detail ? fractionToPctStr(detail.maxRebatePercentage) : '0.00'}
          onModeChange={(next) => {
            setElectronicMode(next);
            if (!detail) return;
            const maxPct = fractionToPctStr(detail.maxRebatePercentage);
            if (next === 'ALL') setElectronicPctDisplay('0.00');
            if (next === 'NONE') setElectronicPctDisplay(maxPct);
          }}
          onPctChange={setElectronicPctDisplay}
        />

        <RebateSection
          title="百家乐退水"
          description="只显示当前层级可往下分配的百家乐退水额度。"
          mode={baccaratMode}
          pctDisplay={baccaratPctDisplay}
          maxPctDisplay={detail ? fractionToPctStr(detail.maxBaccaratRebatePercentage) : '0.00'}
          onModeChange={(next) => {
            setBaccaratMode(next);
            if (!detail) return;
            const maxPct = fractionToPctStr(detail.maxBaccaratRebatePercentage);
            if (next === 'ALL') setBaccaratPctDisplay('0.00');
            if (next === 'NONE') setBaccaratPctDisplay(maxPct);
          }}
          onPctChange={setBaccaratPctDisplay}
        />

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy || !detail} className="btn-acid">
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

function RebateSection({
  title,
  description,
  mode,
  pctDisplay,
  maxPctDisplay,
  onModeChange,
  onPctChange,
}: {
  title: string;
  description: string;
  mode: RebateMode;
  pctDisplay: string;
  maxPctDisplay: string;
  onModeChange: (mode: RebateMode) => void;
  onPctChange: (value: string) => void;
}): JSX.Element {
  return (
    <section className="rounded-md border border-ink-200 bg-ink-100/30 p-4">
      <div className="mb-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-ink-700">{title}</div>
        <div className="mt-1 text-[11px] text-ink-500">{description}</div>
      </div>

      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">目前模式</span>
          <span className="font-semibold text-ink-900">{rebateModeLabel[mode]}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-ink-500">当前可分配上限</span>
          <span className="data-num text-[#186073]">{maxPctDisplay}%</span>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">退水模式</div>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as RebateMode)}
            className="term-input"
          >
            <option value="PERCENTAGE">按比例分配</option>
            <option value="ALL">全拿退水</option>
            <option value="NONE">全退下级</option>
          </select>
        </label>

        {mode !== 'PERCENTAGE' && (
          <div className="rounded-md border border-ink-200 bg-ink-100/40 px-3 py-2 text-[11px] text-ink-600">
            {mode === 'ALL'
              ? '本级代理保留全部可用退水，下级可分配退水为 0%。'
              : `本级代理不保留退水，下级可分配退水为 ${maxPctDisplay}%。`}
          </div>
        )}

        {mode === 'PERCENTAGE' && (
          <label className="block">
            <div className="label mb-2">退水比例（%，不得超过 {maxPctDisplay}%）</div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={pctDisplay}
                onChange={(e) => onPctChange(e.target.value)}
                className="term-input font-mono pr-8"
                placeholder="例如 0.50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-500">
                %
              </span>
            </div>
          </label>
        )}
      </div>
    </section>
  );
}
