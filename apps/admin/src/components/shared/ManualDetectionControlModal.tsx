import { useEffect, useMemo, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
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

const DEFAULT_FREEZE_THRESHOLD = '50000';

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
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('ALL');
      setTarget(null);
      setControlPercentage('50');
      setLineFreezeThreshold(DEFAULT_FREEZE_THRESHOLD);
      setSelectedTemplateKeys([]);
      setErr(null);
      setBusy(false);
      return;
    }
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

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      if (selectedTemplateKeys.length === 0) {
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
        lifecycleTemplateKeys: selectedTemplateKeys,
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

        {scope !== 'ALL' && (
          <AccountSearchSelect
            key={scope}
            kind={scope === 'AGENT_LINE' ? 'agent' : 'member'}
            label={scope === 'AGENT_LINE' ? '目標代理帳號' : '目標會員帳號'}
            value={target}
            onChange={setTarget}
            placeholder={scope === 'AGENT_LINE' ? '輸入代理帳號或名稱' : '輸入會員帳號或名稱'}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="label mb-2">介入機率（1-100）</div>
            <input
              type="text"
              value={controlPercentage}
              onChange={(e) => setControlPercentage(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">整線凍結金額</div>
            <input
              type="text"
              value={lineFreezeThreshold}
              onChange={(e) => setLineFreezeThreshold(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>

        <div>
          <div className="label mb-2">路徑方案</div>
          <div className="grid gap-2">
            {templates.map((template) => {
              const checked = selectedTemplateKeys.includes(template.key);
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => toggleTemplate(template.key)}
                  className={`rounded-[6px] border px-3 py-3 text-left transition ${
                    checked
                      ? 'border-[#186073] bg-[#EFF8FB] text-[#173247]'
                      : 'border-[#D7E3EA] bg-white text-[#334155]'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTemplate(template.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 h-4 w-4 accent-[#186073]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold">{template.label}</span>
                      <span className="mt-1 block break-words font-mono text-[11px] text-[#186073]">
                        {template.steps.map((step) => `${step}%`).join(' -> ')}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[6px] border border-[#AE8B35]/25 bg-[#FFF8E1] px-4 py-3 text-[11px] text-[#5C4B1F]">
          <div className="font-semibold text-[#7A5F15]">已選 {selectedTemplates.length} 組路徑</div>
          <div className="mt-1">
            新入點或重置週期時，符合範圍的會員會從已選路徑中隨機分配一組；達到凍結金額時會凍結所屬代理線。
          </div>
        </div>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-acid">
            建立
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            取消
          </button>
        </div>
      </div>
    </Modal>
  );
}
