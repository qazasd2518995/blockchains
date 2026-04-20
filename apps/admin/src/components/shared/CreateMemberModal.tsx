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
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/),
  displayName: z.string().optional(),
  initialBalance: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'must be a positive decimal')
    .optional()
    .or(z.literal('')),
  notes: z.string().max(500).optional(),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (m: MemberPublic) => void;
  defaultAgentId?: string;
}

export function CreateMemberModal({ open, onClose, onCreated, defaultAgentId }: Props): JSX.Element {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { agentId: defaultAgentId ?? '' } });

  useEffect(() => {
    if (!open) return;
    setErr(null);
    reset({ agentId: defaultAgentId ?? '', email: '', password: '', displayName: '', initialBalance: '', notes: '' });
    void (async () => {
      try {
        // 預設抓自己 + 直接子代理作為候選
        const me = await adminApi.get<{ items: AgentPublic[] }>('/agents');
        setAgents(me.data.items);
      } catch {
        setAgents([]);
      }
    })();
  }, [open, defaultAgentId, reset]);

  const onSubmit = async (data: FormInput) => {
    setErr(null);
    try {
      const res = await adminApi.post<MemberPublic>('/members', {
        agentId: data.agentId,
        email: data.email,
        password: data.password,
        displayName: data.displayName || undefined,
        initialBalance: data.initialBalance || undefined,
        notes: data.notes || undefined,
      });
      onCreated(res.data);
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="CREATE MEMBER" subtitle={t.members.create} width="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t.members.agent} code="01" error={errors.agentId?.message}>
          <select {...register('agentId')} className="term-input">
            <option value="">— {t.common.search} —</option>
            {defaultAgentId && !agents.find((a) => a.id === defaultAgentId) && (
              <option value={defaultAgentId}>{defaultAgentId}</option>
            )}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username} · LVL{a.level}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t.members.email} code="02" error={errors.email?.message}>
          <input type="email" {...register('email')} className="term-input" placeholder="player@bg.local" />
        </Field>

        <Field label={t.members.password} code="03" error={errors.password?.message}>
          <input type="password" {...register('password')} className="term-input" placeholder="••••••••" />
        </Field>

        <Field label={t.members.displayName} code="04" error={errors.displayName?.message}>
          <input type="text" {...register('displayName')} className="term-input" />
        </Field>

        <Field label={t.members.initialBalance} code="05" error={errors.initialBalance?.message}>
          <input type="text" inputMode="decimal" {...register('initialBalance')} className="term-input" placeholder="0.00 (選填)" />
        </Field>

        <Field label={t.members.notes} code="06" error={errors.notes?.message}>
          <textarea rows={2} {...register('notes')} className="term-input resize-none" />
        </Field>

        {err && (
          <div className="border border-wine-400/55 bg-wine-50 p-3 text-[12px] text-wine-500">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → {t.common.create}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
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
        {error && <span className="text-[10px] text-wine-500">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
