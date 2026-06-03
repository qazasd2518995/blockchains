import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { AccountSearchSelect, type AccountSearchOption } from './AccountSearchSelect';
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

interface BitePreview {
  gameDay: string;
  bitePercentage: string;
  houseTakePercentage: string;
  capitalAmount: string;
  biteAmount: string;
  platformTake: string;
  redistributionAmount: string;
  currentSettlement: string;
  targetSettlement: string;
}

type Mode = 'target' | 'bite';
type CompletionBehavior = 'stop_on_target' | 'hold_target';

function playerSettlementNumber(superiorSettlement?: string | null): number {
  const n = Number.parseFloat(superiorSettlement ?? '0');
  if (!Number.isFinite(n)) return 0;
  return -n;
}

function playerSettlementInput(superiorSettlement?: string | null): string {
  return playerSettlementNumber(superiorSettlement).toFixed(2);
}

function superiorSettlementInput(playerSettlement?: string | null): string {
  const n = Number.parseFloat(playerSettlement ?? '0');
  if (!Number.isFinite(n)) return '0';
  return String(-n);
}

export function ManualDetectionControlModal({ open, onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('target');
  const [scope, setScope] = useState<Scope>('ALL');
  const [target, setTarget] = useState<AccountSearchOption | null>(null);
  const [targetSettlement, setTargetSettlement] = useState('0');
  const [bitePercentage, setBitePercentage] = useState('10');
  const [controlPercentage, setControlPercentage] = useState('50');
  const [completionBehavior, setCompletionBehavior] =
    useState<CompletionBehavior>('stop_on_target');
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [bitePreview, setBitePreview] = useState<BitePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode('target');
      setScope('ALL');
      setTarget(null);
      setTargetSettlement('0');
      setBitePercentage('10');
      setControlPercentage('50');
      setCompletionBehavior('stop_on_target');
      setPreview(null);
      setBitePreview(null);
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
    if (!target) {
      throw new Error(scope === 'AGENT_LINE' ? '请先选择目标代理账号' : '请先选择目标会员账号');
    }
    return scope === 'AGENT_LINE'
      ? { agentId: target.id, agentUsername: target.username }
      : { memberId: target.id, memberUsername: target.username };
  };

  const loadPreview = async (): Promise<void> => {
    setLoadingPreview(true);
    setErr(null);
    try {
      const target = await resolveTarget();
      if (mode === 'bite') {
        const response = await adminApi.get<BitePreview>(
          '/controls/manual-detection/bite-preview',
          {
            params: {
              scope,
              agentId: target.agentId,
              memberUsername: target.memberUsername,
              bitePercentage,
              houseTakePercentage: '10',
            },
          },
        );
        setBitePreview(response.data);
        setTargetSettlement(playerSettlementInput(response.data.targetSettlement));
        setPreview(null);
      } else {
        const response = await adminApi.get<SettlementPreview>(
          '/controls/manual-detection/settlement',
          {
            params: {
              scope,
              agentId: target.agentId,
              memberUsername: target.memberUsername,
            },
          },
        );
        setPreview(response.data);
        setBitePreview(null);
      }
    } catch (e) {
      setPreview(null);
      setBitePreview(null);
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
        targetSettlement: superiorSettlementInput(targetSettlement),
        controlPercentage: Number.parseInt(controlPercentage, 10),
        bitePercentage: mode === 'bite' ? bitePercentage : undefined,
        houseTakePercentage: mode === 'bite' ? '10' : undefined,
        completionBehavior:
          mode === 'target' && scope !== 'ALL' ? completionBehavior : 'stop_on_target',
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('target');
              setBitePreview(null);
            }}
            className={`rounded-[6px] border px-3 py-2 text-[12px] font-semibold ${
              mode === 'target'
                ? 'border-[#186073] bg-[#186073] text-white'
                : 'border-[#D7E3EA] bg-white text-[#334155]'
            }`}
          >
            目標玩家交收
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('bite');
              setPreview(null);
              setCompletionBehavior('stop_on_target');
            }}
            className={`rounded-[6px] border px-3 py-2 text-[12px] font-semibold ${
              mode === 'bite'
                ? 'border-[#E4612A] bg-[#E4612A] text-white'
                : 'border-[#D7E3EA] bg-white text-[#334155]'
            }`}
          >
            自動偵測咬度
          </button>
        </div>

        <label className="block">
          <div className="label mb-2">控制范围</div>
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTarget(null);
              setPreview(null);
              setBitePreview(null);
              if (e.target.value === 'ALL') setCompletionBehavior('stop_on_target');
            }}
            className="term-input"
          >
            <option value="ALL">全盘交收</option>
            <option value="AGENT_LINE">代理线交收</option>
            <option value="MEMBER">会员交收</option>
          </select>
        </label>

        {scope !== 'ALL' && (
          <AccountSearchSelect
            key={scope}
            kind={scope === 'AGENT_LINE' ? 'agent' : 'member'}
            label={scope === 'AGENT_LINE' ? '目标代理账号' : '目标会员账号'}
            value={target}
            onChange={(next) => {
              setTarget(next);
              setPreview(null);
            }}
            placeholder={scope === 'AGENT_LINE' ? '输入代理账号或全名' : '输入会员账号或全名'}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">目标玩家交收</div>
            <input
              type="text"
              value={targetSettlement}
              onChange={(e) => setTargetSettlement(e.target.value)}
              className="term-input font-mono"
              readOnly={mode === 'bite'}
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

        {mode === 'target' && scope !== 'ALL' && (
          <div>
            <div className="label mb-2">達標後行為</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCompletionBehavior('stop_on_target')}
                className={`rounded-[6px] border px-3 py-2 text-[12px] font-semibold ${
                  completionBehavior === 'stop_on_target'
                    ? 'border-[#186073] bg-[#186073] text-white'
                    : 'border-[#D7E3EA] bg-white text-[#334155]'
                }`}
              >
                達標回大盤
              </button>
              <button
                type="button"
                onClick={() => setCompletionBehavior('hold_target')}
                className={`rounded-[6px] border px-3 py-2 text-[12px] font-semibold ${
                  completionBehavior === 'hold_target'
                    ? 'border-[#E4612A] bg-[#E4612A] text-white'
                    : 'border-[#D7E3EA] bg-white text-[#334155]'
                }`}
              >
                鎖定目標
              </button>
            </div>
          </div>
        )}

        {mode === 'bite' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="label mb-2">咬度（10-70%）</div>
              <input
                type="text"
                value={bitePercentage}
                onChange={(e) => {
                  setBitePercentage(e.target.value);
                  setBitePreview(null);
                }}
                className="term-input font-mono"
              />
            </label>
            <div className="rounded-[6px] border border-[#E4612A]/25 bg-[#FFF4ED] p-3 text-[11px] text-[#7A321A]">
              平台留存固定為咬度池的 10%。例：餘額 10,000、咬度 10%，本輪玩家交收目標減少 100，其餘
              900 透過自然派發體感回到玩家。
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadPreview()}
            disabled={loadingPreview}
            className="btn-teal-outline text-[11px]"
          >
            {loadingPreview ? '读取中…' : mode === 'bite' ? '計算咬度目標' : '读取当前交收'}
          </button>
          <span className="text-[11px] text-ink-500">
            正数代表玩家赢，负数代表玩家输；未命中机率时自然开奖。
          </span>
        </div>

        {preview && (
          <div className="rounded-[6px] border border-[#186073]/20 bg-[#186073]/5 p-3 text-[12px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-[#186073]">当前交收快照</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#4A5568]">
                {preview.gameDay}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                总投注 <span className="ml-2 font-mono text-[#186073]">{preview.totalBet}</span>
              </div>
              <div>
                总派彩 <span className="ml-2 font-mono text-[#186073]">{preview.totalPayout}</span>
              </div>
              <div>
                返水影响{' '}
                <span className="ml-2 font-mono text-[#AE8B35]">{preview.totalRebate}</span>
              </div>
              <div>
                当前玩家交收{' '}
                <span
                  className={`ml-2 font-mono font-semibold ${playerSettlementNumber(preview.superiorSettlement) > 0 ? 'text-[#2BAA6A]' : 'text-[#D4574A]'}`}
                >
                  {playerSettlementInput(preview.superiorSettlement)}
                </span>
              </div>
            </div>
          </div>
        )}

        {bitePreview && (
          <div className="rounded-[6px] border border-[#E4612A]/25 bg-[#FFF4ED] p-3 text-[12px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-[#A44722]">咬度計算</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#7A321A]">
                {bitePreview.gameDay}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                總餘額{' '}
                <span className="ml-2 font-mono text-[#186073]">{bitePreview.capitalAmount}</span>
              </div>
              <div>
                咬度池{' '}
                <span className="ml-2 font-mono text-[#AE8B35]">{bitePreview.biteAmount}</span>
              </div>
              <div>
                上級留存{' '}
                <span className="ml-2 font-mono font-semibold text-[#2BAA6A]">
                  +{bitePreview.platformTake}
                </span>
              </div>
              <div>
                體感派發{' '}
                <span className="ml-2 font-mono text-[#186073]">
                  {bitePreview.redistributionAmount}
                </span>
              </div>
              <div>
                目前玩家交收{' '}
                <span className="ml-2 font-mono">
                  {playerSettlementInput(bitePreview.currentSettlement)}
                </span>
              </div>
              <div>
                本輪目標{' '}
                <span className="ml-2 font-mono font-semibold text-[#A44722]">
                  {playerSettlementInput(bitePreview.targetSettlement)}
                </span>
              </div>
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
