import { useEffect, useMemo, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { generateLifecyclePath, maxLifecycleRecoveryCount } from '@/lib/lifecyclePathGenerator';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
import { Modal } from './Modal';

export interface AutoBalanceTemplateOption {
  key: string;
  label: string;
  steps: number[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  templates: AutoBalanceTemplateOption[];
}

type Scope = 'ALL' | 'AGENT_LINE' | 'MEMBER';
type PathSource = 'GENERATED' | 'PRESET';

const DEFAULT_FREEZE_THRESHOLD = '50000';
const DEFAULT_STAGE_COUNT = 15;
const DEFAULT_RECOVERY_COUNT = 2;

export function ManualDetectionControlModal({
  open,
  onClose,
  onDone,
  templates,
}: Props): JSX.Element {
  const firstTemplateKey = templates[0]?.key ?? '';
  const [scope, setScope] = useState<Scope>('ALL');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [controlPercentage, setControlPercentage] = useState('50');
  const [lineFreezeThreshold, setLineFreezeThreshold] = useState(DEFAULT_FREEZE_THRESHOLD);
  const [pathSource, setPathSource] = useState<PathSource>('GENERATED');
  const [stageCount, setStageCount] = useState(DEFAULT_STAGE_COUNT);
  const [recoveryCount, setRecoveryCount] = useState(DEFAULT_RECOVERY_COUNT);
  const [generatedSteps, setGeneratedSteps] = useState<number[]>([]);
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('ALL');
      setTarget(null);
      setControlPercentage('50');
      setLineFreezeThreshold(DEFAULT_FREEZE_THRESHOLD);
      setPathSource('GENERATED');
      setStageCount(DEFAULT_STAGE_COUNT);
      setRecoveryCount(DEFAULT_RECOVERY_COUNT);
      setGeneratedSteps([]);
      setSelectedTemplateKeys([]);
      setErr(null);
      setBusy(false);
      return;
    }

    setGeneratedSteps((current) =>
      current.length > 0
        ? current
        : generateLifecyclePath({
            stageCount: DEFAULT_STAGE_COUNT,
            recoveryCount: DEFAULT_RECOVERY_COUNT,
          }),
    );
    setSelectedTemplateKeys((current) => {
      if (current.length > 0) {
        const valid = current.filter((key) => templates.some((template) => template.key === key));
        if (valid.length > 0) return valid;
      }
      return firstTemplateKey ? [firstTemplateKey] : [];
    });
  }, [firstTemplateKey, open, templates]);

  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateKeys.includes(template.key)),
    [selectedTemplateKeys, templates],
  );
  const maximumRecoveryCount = maxLifecycleRecoveryCount(stageCount);
  const actualRecoveryCount = generatedSteps.filter((step) => step === 100).length;

  const resolveTarget = (): {
    agentId?: string;
    agentUsername?: string;
    memberId?: string;
    memberUsername?: string;
  } => {
    if (scope === 'ALL') return {};
    if (!target) {
      throw new Error(scope === 'AGENT_LINE' ? '請先選擇目標代理帳號' : '請先選擇目標會員帳號');
    }
    return scope === 'AGENT_LINE'
      ? { agentId: target.id, agentUsername: target.username }
      : { memberId: target.id, memberUsername: target.username };
  };

  const toggleTemplate = (key: string): void => {
    setSelectedTemplateKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return [...current, key];
    });
  };

  const updateStageCount = (value: number): void => {
    const next = Math.min(100, Math.max(1, Math.trunc(value || 1)));
    setStageCount(next);
    setRecoveryCount((current) => Math.min(current, maxLifecycleRecoveryCount(next)));
    setGeneratedSteps([]);
    setErr(null);
  };

  const updateRecoveryCount = (value: number): void => {
    setRecoveryCount(Math.min(maximumRecoveryCount, Math.max(0, Math.trunc(value || 0))));
    setGeneratedSteps([]);
    setErr(null);
  };

  const generatePath = (): void => {
    setGeneratedSteps(generateLifecyclePath({ stageCount, recoveryCount }));
    setErr(null);
  };

  const updateGeneratedStep = (index: number, value: number): void => {
    setGeneratedSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index
          ? Number(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)).toFixed(2))
          : step,
      ),
    );
  };

  const validateGeneratedPath = (): void => {
    if (generatedSteps.length !== stageCount) {
      throw new Error('請先按「生成路徑」，產生符合目前階段數的路徑');
    }
    if (generatedSteps.at(-1) !== 0) throw new Error('最後一階必須是 0%');
    if (generatedSteps[0] === 100) throw new Error('第一階不可與起始本金同為 100%');
    if (generatedSteps.some((step, index) => index > 0 && step === generatedSteps[index - 1])) {
      throw new Error('相鄰階段不可使用相同百分比');
    }
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      if (pathSource === 'GENERATED') {
        validateGeneratedPath();
      } else if (selectedTemplateKeys.length === 0) {
        throw new Error('請至少選擇一組本金路徑');
      }
      const target = resolveTarget();
      await adminApi.post('/controls/manual-detection/activate', {
        scope,
        controlMode: 'lifecycle_path',
        targetAgentId: target.agentId,
        targetAgentUsername: target.agentUsername,
        targetMemberId: target.memberId,
        targetMemberUsername: target.memberUsername,
        targetSettlement: '0',
        controlPercentage: Number.parseInt(controlPercentage, 10),
        lifecycleTemplateKeys: pathSource === 'PRESET' ? selectedTemplateKeys : undefined,
        lifecycleSteps: pathSource === 'GENERATED' ? generatedSteps : undefined,
        lineFreezeThreshold,
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
    <Modal open={open} onClose={onClose} title="新增路徑控制" subtitle="本金路徑控制" width="md">
      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">控制範圍</div>
          <select
            name="controlScope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTarget(null);
            }}
            className="term-input"
          >
            <option value="ALL">全盤會員</option>
            <option value="AGENT_LINE">指定代理線</option>
            <option value="MEMBER">指定會員</option>
          </select>
        </label>

        {scope !== 'ALL' ? (
          <AccountSearchSelect
            key={scope}
            kind={scope === 'AGENT_LINE' ? 'agent' : 'member'}
            label={scope === 'AGENT_LINE' ? '目標代理帳號' : '目標會員帳號'}
            value={target}
            onChange={setTarget}
            placeholder={scope === 'AGENT_LINE' ? '輸入代理帳號或名稱…' : '輸入會員帳號或名稱…'}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="label mb-2">介入機率（1–100）</div>
            <input
              name="controlPercentage"
              type="number"
              min="1"
              max="100"
              inputMode="numeric"
              autoComplete="off"
              value={controlPercentage}
              onChange={(e) => setControlPercentage(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">整線凍結金額</div>
            <input
              name="lineFreezeThreshold"
              type="number"
              min="0"
              inputMode="decimal"
              autoComplete="off"
              value={lineFreezeThreshold}
              onChange={(e) => setLineFreezeThreshold(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>

        <fieldset>
          <legend className="label mb-2">路徑來源</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={pathSource === 'GENERATED'}
              onClick={() => setPathSource('GENERATED')}
              className={`rounded-[6px] border px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                pathSource === 'GENERATED'
                  ? 'border-[#186073] bg-[#EFF8FB] text-[#173247]'
                  : 'border-[#D7E3EA] bg-white text-[#64748B] hover:border-[#8FA9B7]'
              }`}
            >
              自動生成
            </button>
            <button
              type="button"
              aria-pressed={pathSource === 'PRESET'}
              onClick={() => setPathSource('PRESET')}
              className={`rounded-[6px] border px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                pathSource === 'PRESET'
                  ? 'border-[#186073] bg-[#EFF8FB] text-[#173247]'
                  : 'border-[#D7E3EA] bg-white text-[#64748B] hover:border-[#8FA9B7]'
              }`}
            >
              既有方案
            </button>
          </div>
        </fieldset>

        {pathSource === 'GENERATED' ? (
          <GeneratedPathEditor
            stageCount={stageCount}
            recoveryCount={recoveryCount}
            maximumRecoveryCount={maximumRecoveryCount}
            actualRecoveryCount={actualRecoveryCount}
            steps={generatedSteps}
            onStageCountChange={updateStageCount}
            onRecoveryCountChange={updateRecoveryCount}
            onGenerate={generatePath}
            onStepChange={updateGeneratedStep}
          />
        ) : (
          <PresetPathPicker
            templates={templates}
            selectedTemplateKeys={selectedTemplateKeys}
            onToggle={toggleTemplate}
          />
        )}

        <div className="rounded-[6px] border border-[#AE8B35]/25 bg-[#FFF8E1] px-4 py-3 text-[11px] text-[#5C4B1F]">
          <div className="font-semibold text-[#7A5F15]">
            {pathSource === 'GENERATED'
              ? `自訂 ${generatedSteps.length || stageCount} 階 · 回正 ${actualRecoveryCount} 次`
              : `已選 ${selectedTemplates.length} 組路徑`}
          </div>
          <div className="mt-1">新入點或重置週期時套用路徑；達到凍結金額時會凍結所屬代理線。</div>
        </div>

        {err ? (
          <div
            role="status"
            aria-live="polite"
            className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]"
          >
            {err}
          </div>
        ) : null}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-acid">
            {busy ? '建立中…' : '建立路徑控制'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-teal-outline">
            取消
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GeneratedPathEditor({
  stageCount,
  recoveryCount,
  maximumRecoveryCount,
  actualRecoveryCount,
  steps,
  onStageCountChange,
  onRecoveryCountChange,
  onGenerate,
  onStepChange,
}: {
  stageCount: number;
  recoveryCount: number;
  maximumRecoveryCount: number;
  actualRecoveryCount: number;
  steps: number[];
  onStageCountChange: (value: number) => void;
  onRecoveryCountChange: (value: number) => void;
  onGenerate: () => void;
  onStepChange: (index: number, value: number) => void;
}): JSX.Element {
  return (
    <div className="space-y-3 rounded-[6px] border border-[#D7E3EA] bg-[#F8FBFC] p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <div className="label mb-2">總階段數</div>
          <input
            name="lifecycleStageCount"
            type="number"
            min="1"
            max="100"
            inputMode="numeric"
            autoComplete="off"
            value={stageCount}
            onChange={(event) => onStageCountChange(Number(event.target.value))}
            className="term-input font-mono"
          />
          <div className="mt-1 text-[10px] text-ink-500">1～100 階，包含最後 0%</div>
        </label>
        <label className="block">
          <div className="label mb-2">回正次數</div>
          <input
            name="lifecycleRecoveryCount"
            type="number"
            min="0"
            max={maximumRecoveryCount}
            inputMode="numeric"
            autoComplete="off"
            value={recoveryCount}
            onChange={(event) => onRecoveryCountChange(Number(event.target.value))}
            className="term-input font-mono"
          />
          <div className="mt-1 text-[10px] text-ink-500">
            目前最多 {maximumRecoveryCount} 次回到 100%
          </div>
        </label>
        <button type="button" onClick={onGenerate} className="btn-teal-outline whitespace-nowrap">
          {steps.length > 0 ? '重新生成' : '生成路徑'}
        </button>
      </div>

      {steps.length > 0 ? (
        <>
          <div className="rounded-[5px] border border-[#B9D3DC] bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="label">路徑預覽</div>
              <div className="text-[10px] text-ink-500">
                {steps.length} 階 · 回正 {actualRecoveryCount} 次
              </div>
            </div>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto overscroll-contain pr-1 font-mono text-[10px]">
              {steps.map((step, index) => {
                const previous = index === 0 ? 100 : (steps[index - 1] ?? 100);
                const direction =
                  step === 0 ? 'final' : step === 100 ? 'recover' : step > previous ? 'up' : 'down';
                return (
                  <span key={index} className="inline-flex items-center gap-1">
                    {index > 0 ? <span className="text-ink-400">→</span> : null}
                    <span
                      className={`rounded border px-1.5 py-1 ${
                        direction === 'recover'
                          ? 'border-[#C9A24C] bg-[#FFF8E1] text-[#7A5F15]'
                          : direction === 'up'
                            ? 'border-[#74B7A0] bg-[#EDFFF5] text-[#1F7A4D]'
                            : direction === 'final'
                              ? 'border-[#D4574A] bg-[#FDF0EE] text-[#A53C32]'
                              : 'border-[#D7E3EA] bg-[#F8FAFC] text-[#475569]'
                      }`}
                    >
                      {step}%
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <details className="rounded-[5px] border border-[#D7E3EA] bg-white p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-[#186073]">
              編輯個別階段
            </summary>
            <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-3">
              {steps.map((step, index) => {
                const isFinal = index === steps.length - 1;
                return (
                  <label key={index} className="block [content-visibility:auto]">
                    <span className="mb-1 block text-[10px] text-ink-500">第 {index + 1} 階</span>
                    <div className="relative">
                      <input
                        name={`lifecycleStep${index + 1}`}
                        aria-label={`第 ${index + 1} 階本金百分比`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        autoComplete="off"
                        value={step}
                        disabled={isFinal}
                        onChange={(event) => onStepChange(index, Number(event.target.value))}
                        className="term-input pr-7 font-mono disabled:bg-[#F1F5F9] disabled:text-ink-400"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">
                        %
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </details>
        </>
      ) : (
        <div className="rounded-[5px] border border-dashed border-[#B9C8D1] bg-white px-3 py-5 text-center text-[11px] text-ink-500">
          階段設定已變更，請按「生成路徑」更新預覽。
        </div>
      )}
    </div>
  );
}

function PresetPathPicker({
  templates,
  selectedTemplateKeys,
  onToggle,
}: {
  templates: AutoBalanceTemplateOption[];
  selectedTemplateKeys: string[];
  onToggle: (key: string) => void;
}): JSX.Element {
  return (
    <fieldset>
      <legend className="label mb-2">既有路徑方案</legend>
      <div className="grid max-h-64 gap-2 overflow-y-auto overscroll-contain pr-1">
        {templates.map((template) => {
          const checked = selectedTemplateKeys.includes(template.key);
          return (
            <label
              key={template.key}
              className={`flex cursor-pointer items-start gap-3 rounded-[6px] border px-3 py-3 transition-colors ${
                checked
                  ? 'border-[#186073] bg-[#EFF8FB] text-[#173247]'
                  : 'border-[#D7E3EA] bg-white text-[#334155] hover:border-[#8FA9B7]'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(template.key)}
                className="mt-0.5 h-4 w-4 accent-[#186073]"
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold">{template.label}</span>
                <span className="mt-1 block break-words font-mono text-[11px] text-[#186073]">
                  {template.steps.map((step) => `${step}%`).join(' → ')}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
