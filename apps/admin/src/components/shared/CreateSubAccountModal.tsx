import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import type { AgentPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

const schema = z.object({
  username: z
    .string()
    .min(3, '账号至少 3 位')
    .max(64, '账号至多 64 位')
    .regex(/^[a-zA-Z0-9._-]+$/, '账号仅限字母、数字、. _ -'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(128, '密码最长 128')
    .regex(/[A-Za-z]/, '需包含字母')
    .regex(/\d/, '需包含数字'),
  confirmPassword: z.string().min(8, '请再次输入密码'),
  displayName: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: '两次输入的密码不一致',
});

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (a: AgentPublic) => void;
  parentUsername: string | null;
  /** SUPER_ADMIN 建給指定代理時用（AGENT 留空，後端會用自己的 id） */
  parentAgentId?: string;
}

export function CreateSubAccountModal({
  open,
  onClose,
  onCreated,
  parentUsername,
  parentAgentId,
}: Props): JSX.Element {
  const [err, setErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setErr(null);
    reset({ username: '', password: '', confirmPassword: '', displayName: '', notes: '' });
  }, [open, reset]);

  const onSubmit = async (data: FormInput) => {
    setErr(null);
    try {
      const payload: Record<string, string | undefined> = {
        username: data.username,
        password: data.password,
        displayName: data.displayName || undefined,
        notes: data.notes || undefined,
      };
      if (parentAgentId) payload.parentAgentId = parentAgentId;
      const res = await adminApi.post<AgentPublic>('/subaccounts', payload);
      onCreated(res.data);
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="创建子账号" subtitle="新增子账号" width="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="border border-[#186073]/30 bg-[#E8F4F8]/40 p-3 text-[12px] text-[#0F4555]">
          将建立在代理{' '}
          <span className="font-mono font-semibold text-[#186073]">
            {parentUsername ?? '—'}
          </span>{' '}
          下。子账号仅可读取该代理线的报表、注单、会员列表，不能执行任何管理操作。
        </div>

        <Field label="账号" code="01" error={errors.username?.message}>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            {...register('username')}
            className="term-input font-mono"
            placeholder="staff_01"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="密码" code="02" error={errors.password?.message}>
            <input
              type="password"
              {...register('password')}
              className="term-input"
              placeholder="至少 8 位，含英数"
              autoComplete="new-password"
            />
          </Field>
          <Field label="确认密码" code="03" error={errors.confirmPassword?.message}>
            <input
              type="password"
              {...register('confirmPassword')}
              className="term-input"
              placeholder="再次输入密码"
              autoComplete="new-password"
            />
          </Field>
        </div>

        <Field label="显示名称" code="04" error={errors.displayName?.message}>
          <input type="text" {...register('displayName')} className="term-input" placeholder="选填" />
        </Field>

        <Field label="备注" code="05" error={errors.notes?.message}>
          <textarea rows={2} {...register('notes')} className="term-input resize-none" />
        </Field>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → 建立子账号
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
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
