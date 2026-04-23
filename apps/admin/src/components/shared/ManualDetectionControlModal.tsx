import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type Scope = 'ALL' | 'AGENT_LINE' | 'MEMBER';

interface SettlementPreview {
  gameDay: string;
  totalBet: string;
  totalPayout: string;
  totalRebate: string;
  superiorSettlement: string;
}

export function ManualDetectionControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [scope, setScope] = useState<Scope>('ALL');
  const [targetValue, setTargetValue] = useState('');
  const [targetSettlement, setTargetSettlement] = useState('0');
  const [controlPercentage, setControlPercentage] = useState('50');
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!open) {
      setScope('ALL');
      setTargetValue('');
      setTargetSettlement('0');
      setControlPercentage('50');
      setPreview(null);
      setErr(null);
      setBusy(false);
      setLoadingPreview(false);
    }
  }, [open]);

  const resolveTarget = async (): Promise<{
    agentId?: string;
    agentUsername?: string;
    memberId?: string;
    memberUsername?: string;
  }> => {
    if (scope === 'ALL') return {};
    if (!targetValue.trim()) {
      throw new Error(scope === 'AGENT_LINE' ? '请填目标代理账号' : '请填目标会员账号');
    }
    const endpoint = scope === 'AGENT_LINE' ? '/agents/lookup' : '/members/lookup';
    const lookup = await adminApi.get<{ id: string; username: string }>(endpoint, {
      params: { username: targetValue.trim() },
    });
    return scope === 'AGENT_LINE'
      ? { agentId: lookup.data.id, agentUsername: lookup.data.username }
      : { memberId: lookup.data.id, memberUsername: lookup.data.username };
  };

  const loadPreview = async (): Promise<void> => {
    setLoadingPreview(true);
    setErr(null);
    try {
      const target = await resolveTarget();
      const response = await adminApi.get<SettlementPreview>('/controls/manual-detection/settlement', {
        params: {
          scope,
          agentId: target.agentId,
          memberUsername: target.memberUsername,
        },
      });
      setPreview(response.data);
    } catch (e) {
      setPreview(null);
      setErr(e instanceof Error ? e.message : extractApiError(e).message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const target = await resolveTarget();
      await adminApi.post('/controls/manual-detection/activate', {
        scope,
        targetAgentId: target.agentId,
        targetAgentUsername: target.agentUsername,
        targetMemberId: target.memberId,
        targetMemberUsername: target.memberUsername,
        targetSettlement,
        controlPercentage: Number.parseInt(controlPercentage, 10),
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
    <Modal open={open} onClose={onClose} title="新增手动侦测" subtitle="交收目标控制" width="md">
      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">控制范围</div>
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTargetValue('');
              setPreview(null);
            }}
            className="term-input"
          >
            <option value="ALL">全盘交收</option>
            <option value="AGENT_LINE">代理线交收</option>
            <option value="MEMBER">会员交收</option>
          </select>
        </label>

        {scope !== 'ALL' && (
          <label className="block">
            <div className="label mb-2">{scope === 'AGENT_LINE' ? '目标代理账号' : '目标会员账号'}</div>
            <input
              type="text"
              value={targetValue}
              onChange={(e) => {
                setTargetValue(e.target.value);
                setPreview(null);
              }}
              className="term-input font-mono"
              placeholder={scope === 'AGENT_LINE' ? '输入代理账号' : '输入会员账号'}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">目标上级交收</div>
            <input
              type="text"
              value={targetSettlement}
              onChange={(e) => setTargetSettlement(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">控制机率（1-100）</div>
            <input
              type="text"
              value={controlPercentage}
              onChange={(e) => setControlPercentage(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadPreview()} disabled={loadingPreview} className="btn-teal-outline text-[11px]">
            {loadingPreview ? '读取中…' : '读取当前交收'}
          </button>
          <span className="text-[11px] text-ink-500">目标为正数会拉高交收，目标为负数会压低交收。</span>
        </div>

        {preview && (
          <div className="rounded-[6px] border border-[#186073]/20 bg-[#186073]/5 p-3 text-[12px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-[#186073]">当前交收快照</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#4A5568]">{preview.gameDay}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>总投注 <span className="ml-2 font-mono text-[#186073]">{preview.totalBet}</span></div>
              <div>总派彩 <span className="ml-2 font-mono text-[#186073]">{preview.totalPayout}</span></div>
              <div>返水影响 <span className="ml-2 font-mono text-[#AE8B35]">{preview.totalRebate}</span></div>
              <div>当前交收 <span className="ml-2 font-mono font-semibold text-[#0F172A]">{preview.superiorSettlement}</span></div>
            </div>
          </div>
        )}

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-acid">
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
