import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useMemo, useState } from 'react';
import {
  BETTING_LIMIT_RANGE_OPTIONS,
  DEFAULT_BETTING_LIMIT_RANGE,
  normalizeBettingLimitRangeKey,
  type AgentPublic,
  type BettingLimitsByGame,
  type MemberPublic,
} from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { useTranslation } from '@/i18n/useTranslation';
import { requestAdminLiveRefresh } from '@/lib/adminRefreshEvents';
import {
  BettingLimitsInlineEditor,
  buildBettingLimitsSelection,
  summarizeBettingLimits,
} from './BettingLimitModal';

const schema = z
  .object({
    agentId: z.string().min(1),
    username: z
      .string()
      .min(3, '账号至少 3 位')
      .max(40, '账号至多 40 位')
      .regex(/^[a-zA-Z0-9._-]+$/, '账号仅限字母、数字、. _ -'),
    password: z
      .string()
      .min(8, '密码至少 8 位')
      .regex(/[A-Za-z]/, '需包含字母')
      .regex(/\d/, '需包含数字'),
    confirmPassword: z.string().min(8, '请再次输入密码'),
    initialBalance: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'must be a positive decimal')
      .optional()
      .or(z.literal('')),
    bettingLimitLevel: z.string().min(1),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (m: MemberPublic) => void;
  defaultAgentId?: string;
  lockedAgent?: {
    id: string;
    username: string;
    level: number;
    role?: AgentPublic['role'];
    bettingLimitLevel?: string;
    bettingLimits?: Record<string, string>;
  };
}

export function CreateMemberModal({
  open,
  onClose,
  onCreated,
  defaultAgentId,
  lockedAgent,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentPublic[]>([]);
  const [customLimitOpen, setCustomLimitOpen] = useState(false);
  const [bettingLimits, setBettingLimits] = useState<BettingLimitsByGame>(() =>
    buildBettingLimitsSelection(null, DEFAULT_BETTING_LIMIT_RANGE),
  );
  const [err, setErr] = useState<string | null>(null);
  const resolvedAgentId = lockedAgent?.id ?? defaultAgentId ?? '';
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { agentId: resolvedAgentId, bettingLimitLevel: DEFAULT_BETTING_LIMIT_RANGE },
  });

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setCustomLimitOpen(false);
    const inheritedLevel = normalizeBettingLimitRangeKey(
      lockedAgent?.bettingLimitLevel ?? DEFAULT_BETTING_LIMIT_RANGE,
    );
    setBettingLimits(buildBettingLimitsSelection(lockedAgent?.bettingLimits, inheritedLevel));
    reset({
      agentId: resolvedAgentId,
      username: '',
      password: '',
      confirmPassword: '',
      initialBalance: '',
      bettingLimitLevel: inheritedLevel,
      notes: '',
    });
    if (lockedAgent) {
      setAgents([]);
      return;
    }
    void (async () => {
      try {
        // 预设抓自己 + 直接子代理作为候选
        const me = await adminApi.get<{ items: AgentPublic[] }>('/agents');
        let items = me.data.items;
        if (resolvedAgentId && !items.some((a) => a.id === resolvedAgentId)) {
          try {
            const detail = await adminApi.get<AgentPublic>(`/agents/${resolvedAgentId}`);
            items = [...items, detail.data];
          } catch {
            // Keep the raw option below so the form can still submit with the provided id.
          }
        }
        setAgents(items);
      } catch {
        setAgents([]);
      }
    })();
  }, [open, resolvedAgentId, lockedAgent, reset]);

  const watchedAgentId = watch('agentId');
  const watchedBettingLimitLevel = watch('bettingLimitLevel');
  const selectedAgent = lockedAgent ?? agents.find((agent) => agent.id === watchedAgentId) ?? null;
  const parentLimitLevel =
    selectedAgent?.role === 'SUPER_ADMIN'
      ? 'range_5000_50000'
      : normalizeBettingLimitRangeKey(selectedAgent?.bettingLimitLevel ?? 'range_5000_50000');
  const parentLimits = useMemo(
    () =>
      buildBettingLimitsSelection(
        selectedAgent?.role === 'SUPER_ADMIN' ? null : selectedAgent?.bettingLimits,
        parentLimitLevel,
      ),
    [parentLimitLevel, selectedAgent?.bettingLimits, selectedAgent?.role],
  );

  useEffect(() => {
    if (!open || customLimitOpen) return;
    setBettingLimits(buildBettingLimitsSelection(null, watchedBettingLimitLevel));
  }, [customLimitOpen, open, watchedBettingLimitLevel]);

  const onSubmit = async (data: FormInput) => {
    setErr(null);
    try {
      const res = await adminApi.post<MemberPublic>('/members', {
        agentId: data.agentId,
        username: data.username,
        password: data.password,
        initialBalance: data.initialBalance || undefined,
        bettingLimitLevel: data.bettingLimitLevel,
        bettingLimits,
        notes: data.notes || undefined,
      });
      requestAdminLiveRefresh();
      onCreated(res.data);
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  const modalTitle = lockedAgent ? `为 ${lockedAgent.username} 新增会员` : '新增会员';

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} subtitle="新增下线会员" width="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {lockedAgent ? (
          <div className="rounded-md border border-[#C9A247]/35 bg-[#FFF8DA] px-4 py-3">
            <input type="hidden" {...register('agentId')} />
            <div className="label mb-1">所属代理</div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-900">
              <span className="font-mono">{lockedAgent.username}</span>
              <span className="tag tag-acid">L{lockedAgent.level}</span>
              <span className="text-[11px] font-normal text-ink-500">
                本会员会建立在当前层级下面
              </span>
            </div>
          </div>
        ) : (
          <Field label={t.members.agent} code="01" error={errors.agentId?.message}>
            <select {...register('agentId')} className="term-input">
              <option value="">— {t.common.search} —</option>
              {defaultAgentId && !agents.find((a) => a.id === defaultAgentId) && (
                <option value={defaultAgentId}>{defaultAgentId}</option>
              )}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t.members.username} code="02" error={errors.username?.message}>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            {...register('username')}
            className="term-input"
            placeholder="请输入会员账号"
          />
        </Field>

        <Field label={t.members.password} code="03" error={errors.password?.message}>
          <input
            type="password"
            {...register('password')}
            className="term-input"
            placeholder="至少 8 位，含英数"
          />
        </Field>

        <Field label="确认密码" code="04" error={errors.confirmPassword?.message}>
          <input
            type="password"
            {...register('confirmPassword')}
            className="term-input"
            placeholder="请再次输入密码"
          />
        </Field>

        <Field label="名称 / 备注" code="05" error={errors.notes?.message}>
          <textarea
            rows={2}
            {...register('notes')}
            className="term-input resize-none"
            placeholder="保存后显示在账号下方（选填）"
          />
        </Field>

        <Field label={t.members.initialBalance} code="06" error={errors.initialBalance?.message}>
          <input
            type="text"
            inputMode="decimal"
            {...register('initialBalance')}
            className="term-input"
            placeholder="0.00 (选填)"
          />
        </Field>

        <div className="rounded-md border border-ink-200 bg-ink-100/30 p-4">
          <Field label="限红预设" code="07" error={errors.bettingLimitLevel?.message}>
            <select {...register('bettingLimitLevel')} className="term-input">
              {BETTING_LIMIT_RANGE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                  {option.key === DEFAULT_BETTING_LIMIT_RANGE ? '（預設）' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-white px-3 py-2">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.16em] text-ink-700">
                分類限紅
              </div>
              <div className="mt-1 text-[11px] text-ink-500">
                目前 {summarizeBettingLimits(bettingLimits)}，可展开調整飛行、拉霸、電子即開。
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCustomLimitOpen((value) => !value)}
              className="btn-chip shrink-0"
            >
              {customLimitOpen ? '收起' : '分類設定'}
            </button>
          </div>
          {customLimitOpen && (
            <BettingLimitsInlineEditor
              value={bettingLimits}
              parentLimits={parentLimits}
              onChange={setBettingLimits}
              className="mt-3 max-h-[360px] overflow-y-auto pr-1"
            />
          )}
        </div>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → 建立会员
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [{t.common.cancel}]
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  code,
  error,
  children,
}: {
  label: string;
  code: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-ink-500">{code}</span>
          <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-700">{label}</span>
        </div>
        {error && <span className="text-[10px] text-[#D4574A]">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
