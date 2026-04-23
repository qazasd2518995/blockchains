import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import type { AgentPublic, MemberPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  agentId: z.string().min(1),
  username: z
    .string()
    .min(3, '账号至少 3 位')
    .max(40, '账号至多 40 位')
    .regex(/^[a-zA-Z0-9._-]+$/, '账号仅限字母、数字、. _ -'),
  password: z.string().min(8, '密码至少 8 位').regex(/[A-Za-z]/, '需包含字母').regex(/\d/, '需包含数字'),
  confirmPassword: z.string().min(8, '请再次输入密码'),
  displayName: z.string().optional(),
  initialBalance: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'must be a positive decimal')
    .optional()
    .or(z.literal('')),
  bettingLimitLevel: z.enum(['level1', 'level2', 'level3', 'level4', 'level5', 'unlimited']),
  notes: z.string().max(500).optional(),
}).refine((data) => data.password === data.confirmPassword, {
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
  };
}

export function CreateMemberModal({ open, onClose, onCreated, defaultAgentId, lockedAgent }: Props): JSX.Element {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const resolvedAgentId = lockedAgent?.id ?? defaultAgentId ?? '';
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { agentId: resolvedAgentId, bettingLimitLevel: 'level3' } });

  useEffect(() => {
    if (!open) return;
    setErr(null);
    reset({
      agentId: resolvedAgentId,
      username: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      initialBalance: '',
      bettingLimitLevel: 'level3',
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

  const onSubmit = async (data: FormInput) => {
    setErr(null);
    try {
      const res = await adminApi.post<MemberPublic>('/members', {
        agentId: data.agentId,
        username: data.username,
        password: data.password,
        displayName: data.displayName || undefined,
        initialBalance: data.initialBalance || undefined,
        bettingLimitLevel: data.bettingLimitLevel,
        notes: data.notes || undefined,
      });
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
              <span className="text-[11px] font-normal text-ink-500">本会员会建立在当前层级下面</span>
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
          <input type="password" {...register('password')} className="term-input" placeholder="至少 8 位，含英数" />
        </Field>

        <Field label="确认密码" code="04" error={errors.confirmPassword?.message}>
          <input type="password" {...register('confirmPassword')} className="term-input" placeholder="请再次输入密码" />
        </Field>

        <Field label={t.members.displayName} code="05" error={errors.displayName?.message}>
          <input type="text" {...register('displayName')} className="term-input" placeholder="选填" />
        </Field>

        <Field label={t.members.initialBalance} code="06" error={errors.initialBalance?.message}>
          <input type="text" inputMode="decimal" {...register('initialBalance')} className="term-input" placeholder="0.00 (选填)" />
        </Field>

        <Field label="限红等级" code="07" error={errors.bettingLimitLevel?.message}>
          <select {...register('bettingLimitLevel')} className="term-input">
            <option value="level1">新手（单注 100）</option>
            <option value="level2">一般（单注 500）</option>
            <option value="level3">标准（单注 2,000）</option>
            <option value="level4">进阶（单注 10,000）</option>
            <option value="level5">VIP（单注 50,000）</option>
            <option value="unlimited">不限</option>
          </select>
        </Field>

        <Field label={t.members.notes} code="08" error={errors.notes?.message}>
          <textarea rows={2} {...register('notes')} className="term-input resize-none" placeholder="备注说明（选填）" />
        </Field>

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
