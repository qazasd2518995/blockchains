import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import type { AgentPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

const schema = z.object({
  parentId: z.string().min(1, '請選擇上級代理'),
  username: z
    .string()
    .min(3, '帳號至少 3 位')
    .max(64, '帳號至多 64 位')
    .regex(/^[a-zA-Z0-9._-]+$/, '帳號僅限字母、數字、. _ -'),
  password: z
    .string()
    .min(8, '密碼至少 8 位')
    .max(128, '密碼最長 128')
    .regex(/[A-Za-z]/, '需包含字母')
    .regex(/\d/, '需包含數字'),
  displayName: z.string().max(40).optional(),
  marketType: z.enum(['D', 'A']),
  rebateMode: z.enum(['PERCENTAGE', 'ALL', 'NONE']),
  /** 百分比顯示用（%，例如 "2.50"）；送出時換算為 fraction */
  rebatePercentageDisplay: z.string().regex(/^\d+(\.\d+)?$/, '請填 0-2.5 之間的百分比'),
  bettingLimitLevel: z.enum(['level1', 'level2', 'level3', 'level4', 'level5', 'unlimited']),
  notes: z.string().max(500).optional(),
});

type FormInput = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (a: AgentPublic) => void;
  defaultParentId?: string;
}

/** 平台硬上限 2.5% (fraction 0.025) — 必須與 server 端 PLATFORM_REBATE_CAP 同步 */
const PLATFORM_REBATE_CAP_PCT = 2.5;

export function CreateAgentModal({ open, onClose, onCreated, defaultParentId }: Props): JSX.Element {
  const [parents, setParents] = useState<AgentPublic[]>([]);
  const [selectedParent, setSelectedParent] = useState<AgentPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      parentId: defaultParentId ?? '',
      marketType: 'D',
      rebateMode: 'PERCENTAGE',
      rebatePercentageDisplay: '0',
      bettingLimitLevel: 'level3',
    },
  });

  const watchedParentId = watch('parentId');
  const watchedRebateMode = watch('rebateMode');

  useEffect(() => {
    if (!open) return;
    setErr(null);
    reset({
      parentId: defaultParentId ?? '',
      username: '',
      password: '',
      displayName: '',
      marketType: 'D',
      rebateMode: 'PERCENTAGE',
      rebatePercentageDisplay: '0',
      bettingLimitLevel: 'level3',
      notes: '',
    });
    void (async () => {
      try {
        const me = await adminApi.get<{ items: AgentPublic[] }>('/agents');
        setParents(me.data.items);
      } catch {
        setParents([]);
      }
    })();
  }, [open, defaultParentId, reset]);

  useEffect(() => {
    const p = parents.find((a) => a.id === watchedParentId) ?? null;
    setSelectedParent(p);
  }, [parents, watchedParentId]);

  const parentMaxPct = selectedParent
    ? Math.min(Number.parseFloat(selectedParent.rebatePercentage) * 100, PLATFORM_REBATE_CAP_PCT)
    : PLATFORM_REBATE_CAP_PCT;

  const onSubmit = async (data: FormInput) => {
    setErr(null);

    // 前端驗證退水上限
    if (data.rebateMode === 'PERCENTAGE') {
      const pctNum = Number.parseFloat(data.rebatePercentageDisplay);
      if (pctNum > parentMaxPct + 1e-6) {
        setErr(`退水比例不可超過 ${parentMaxPct.toFixed(2)}%（受上級與平台上限限制）`);
        return;
      }
    }

    // 取 parent 計算 level
    const parent = parents.find((a) => a.id === data.parentId);
    if (!parent) {
      setErr('找不到上級代理');
      return;
    }

    try {
      const rebateFraction = (Number.parseFloat(data.rebatePercentageDisplay) / 100).toFixed(4);
      const res = await adminApi.post<AgentPublic>('/agents', {
        parentId: data.parentId,
        username: data.username,
        password: data.password,
        displayName: data.displayName || undefined,
        level: parent.level + 1,
        marketType: data.marketType,
        rebateMode: data.rebateMode,
        rebatePercentage: rebateFraction,
        bettingLimitLevel: data.bettingLimitLevel,
        notes: data.notes || undefined,
      });
      onCreated(res.data);
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="CREATE AGENT" subtitle="新增下級代理" width="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="上級代理" code="01" error={errors.parentId?.message}>
          <select {...register('parentId')} className="term-input">
            <option value="">— 選擇上級 —</option>
            {defaultParentId && !parents.find((a) => a.id === defaultParentId) && (
              <option value={defaultParentId}>{defaultParentId}</option>
            )}
            {parents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="帳號" code="02" error={errors.username?.message}>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              {...register('username')}
              className="term-input font-mono"
              placeholder="agent_001"
            />
          </Field>
          <Field label="密碼" code="03" error={errors.password?.message}>
            <input type="password" {...register('password')} className="term-input" placeholder="••••••••" />
          </Field>
        </div>

        <Field label="顯示名稱" code="04" error={errors.displayName?.message}>
          <input type="text" {...register('displayName')} className="term-input" placeholder="選填" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="盤口" code="05" error={errors.marketType?.message}>
            <select {...register('marketType')} className="term-input">
              <option value="D">D 盤</option>
              <option value="A">A 盤</option>
            </select>
          </Field>
          <Field label="退水模式" code="06" error={errors.rebateMode?.message}>
            <select {...register('rebateMode')} className="term-input">
              <option value="PERCENTAGE">按比例</option>
              <option value="ALL">上級全收</option>
              <option value="NONE">全退下級</option>
            </select>
          </Field>
        </div>

        {watchedRebateMode === 'PERCENTAGE' && (
          <Field
            label={`退水比例（%，上限 ${parentMaxPct.toFixed(2)}%）`}
            code="07"
            error={errors.rebatePercentageDisplay?.message}
          >
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                {...register('rebatePercentageDisplay')}
                className="term-input font-mono pr-8"
                placeholder="2.50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-500">
                %
              </span>
            </div>
          </Field>
        )}

        <Field label="限紅等級" code="08" error={errors.bettingLimitLevel?.message}>
          <select {...register('bettingLimitLevel')} className="term-input">
            <option value="level1">新手（單注 100）</option>
            <option value="level2">一般（單注 500）</option>
            <option value="level3">標準（單注 2,000）</option>
            <option value="level4">進階（單注 10,000）</option>
            <option value="level5">VIP（單注 50,000）</option>
            <option value="unlimited">不限</option>
          </select>
        </Field>

        <Field label="備註" code="09" error={errors.notes?.message}>
          <textarea rows={2} {...register('notes')} className="term-input resize-none" />
        </Field>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">⚠ {err}</div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-acid">
            → 建立代理
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
