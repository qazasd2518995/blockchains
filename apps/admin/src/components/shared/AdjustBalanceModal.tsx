import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import type { MemberPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  delta: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  description: z.string().max(200).optional(),
});
type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  member: MemberPublic;
  onDone: (m: MemberPublic) => void;
}

export function AdjustBalanceModal({ open, onClose, member, onDone }: Props): JSX.Element {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { delta: '', description: '' } });

  const onSubmit = async (data: FormInput) => {
    setErr(null);
    try {
      const res = await adminApi.post<MemberPublic>(`/members/${member.id}/adjust-balance`, {
        delta: data.delta,
        description: data.description || undefined,
      });
      onDone(res.data);
      reset();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t.adjust.title} subtitle={t.agents.adjustBalance} width="sm">
      <div className="mb-4 border border-ink-200 bg-ink-100/40 p-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">{t.adjust.member}</span>
          <span className="font-mono">{member.username}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-ink-500">{t.adjust.bal}</span>
          <span className="data-num text-brass-700">{member.balance}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block">
          <div className="label mb-2">{t.adjust.delta}</div>
          <input type="text" {...register('delta')} className="term-input font-mono" placeholder="+100.00 / -50" />
          {errors.delta && <div className="mt-1 text-[10px] text-wine-500">⚠ {errors.delta.message}</div>}
        </label>

        <label className="block">
          <div className="label mb-2">{t.adjust.description}</div>
          <input type="text" {...register('description')} className="term-input" />
        </label>

        {err && <div className="border border-wine-400/55 bg-wine-50 p-3 text-[12px] text-wine-500">⚠ {err}</div>}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → {t.common.confirm}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            [{t.common.cancel}]
          </button>
        </div>
      </form>
    </Modal>
  );
}
