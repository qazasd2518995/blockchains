import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import type { AgentPublic } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';
import { type RebateMode, getEffectiveParentRebatePct, rebateFractionForMode } from '@/lib/rebate';

const schema = z.object({
  parentId: z.string().min(1, '请选择上级代理'),
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
  displayName: z.string().max(40).optional(),
  rebateMode: z.enum(['PERCENTAGE', 'ALL', 'NONE']),
  rebatePercentageDisplay: z.string().regex(/^\d+(\.\d+)?$/, '请填写有效百分比'),
  bettingLimitLevel: z.string().min(1),
  notes: z.string().max(500).optional(),
});

type FormInput = z.infer<typeof schema>;

type LockedParentAgent = Pick<
  AgentPublic,
  | 'id'
  | 'username'
  | 'level'
  | 'rebateMode'
  | 'rebatePercentage'
  | 'maxRebatePercentage'
  | 'baccaratRebateMode'
  | 'baccaratRebatePercentage'
  | 'maxBaccaratRebatePercentage'
  | 'marketType'
> & {
  bettingLimitLevel?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (a: AgentPublic) => void;
  defaultParentId?: string;
  lockedParent?: LockedParentAgent;
}

export function CreateAgentModal({
  open,
  onClose,
  onCreated,
  defaultParentId,
  lockedParent,
}: Props): JSX.Element {
  const [parents, setParents] = useState<AgentPublic[]>([]);
  const [selectedParent, setSelectedParent] = useState<LockedParentAgent | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const resolvedParentId = lockedParent?.id ?? defaultParentId ?? '';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      parentId: resolvedParentId,
      rebateMode: 'PERCENTAGE',
      rebatePercentageDisplay: '0',
      bettingLimitLevel: 'range_100_2000',
    },
  });

  const watchedParentId = watch('parentId');
  const watchedRebateMode = watch('rebateMode');

  useEffect(() => {
    if (!open) return;
    setErr(null);
    reset({
      parentId: resolvedParentId,
      username: '',
      password: '',
      displayName: '',
      rebateMode: 'PERCENTAGE',
      rebatePercentageDisplay: '0',
      bettingLimitLevel: normalizeBettingLimit(lockedParent?.bettingLimitLevel) ?? 'range_100_2000',
      notes: '',
    });
    if (lockedParent) {
      setParents([]);
      setSelectedParent(lockedParent);
      void (async () => {
        try {
          const detail = await adminApi.get<AgentPublic>(`/agents/${lockedParent.id}`);
          setSelectedParent(detail.data);
          setValue('parentId', detail.data.id);
          const inheritedLimit = normalizeBettingLimit(detail.data.bettingLimitLevel);
          if (inheritedLimit) setValue('bettingLimitLevel', inheritedLimit);
        } catch {
          setSelectedParent(lockedParent);
        }
      })();
      return;
    }
    void (async () => {
      try {
        const me = await adminApi.get<{ items: AgentPublic[] }>('/agents');
        let items = me.data.items;
        if (resolvedParentId && !items.some((a) => a.id === resolvedParentId)) {
          try {
            const detail = await adminApi.get<AgentPublic>(`/agents/${resolvedParentId}`);
            items = [...items, detail.data];
          } catch {
            // submit 時會再報具體錯誤
          }
        }
        setParents(items);
      } catch {
        setParents([]);
      }
    })();
  }, [open, resolvedParentId, lockedParent, reset, setValue]);

  useEffect(() => {
    if (lockedParent) return;
    const p = parents.find((a) => a.id === watchedParentId) ?? null;
    setSelectedParent(p);
  }, [parents, watchedParentId, lockedParent]);

  const electronicParentMaxPct = selectedParent
    ? getEffectiveParentRebatePct(selectedParent, 'electronic')
    : null;

  useEffect(() => {
    if (!open || electronicParentMaxPct === null) return;
    if (watchedRebateMode === 'ALL') {
      setValue('rebatePercentageDisplay', '0.00');
    } else if (watchedRebateMode === 'NONE') {
      setValue('rebatePercentageDisplay', electronicParentMaxPct.toFixed(2));
    }
  }, [open, electronicParentMaxPct, setValue, watchedRebateMode]);

  const onSubmit = async (data: FormInput) => {
    setErr(null);

    if (electronicParentMaxPct === null) {
      setErr('正在读取当前层级可分配退水，请稍后再试');
      return;
    }

    if (data.rebateMode === 'PERCENTAGE') {
      const pctNum = Number.parseFloat(data.rebatePercentageDisplay);
      if (pctNum > electronicParentMaxPct + 1e-6) {
        setErr(`电子退水比例不可超过 ${electronicParentMaxPct.toFixed(2)}%`);
        return;
      }
    }

    const parent = selectedParent ?? parents.find((a) => a.id === data.parentId);
    if (!parent) {
      setErr('找不到上级代理');
      return;
    }

    try {
      const electronicRebateFraction = rebateFractionForMode(
        data.rebateMode,
        data.rebatePercentageDisplay,
        electronicParentMaxPct,
      );
      const res = await adminApi.post<AgentPublic>('/agents', {
        parentId: data.parentId,
        username: data.username,
        password: data.password,
        displayName: data.displayName || undefined,
        level: parent.level + 1,
        rebateMode: data.rebateMode,
        rebatePercentage: electronicRebateFraction,
        baccaratRebateMode: 'PERCENTAGE',
        baccaratRebatePercentage: '0.0000',
        bettingLimitLevel: data.bettingLimitLevel,
        notes: data.notes || undefined,
      });
      onCreated(res.data);
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    }
  };

  const modalTitle = lockedParent ? `为 ${lockedParent.username} 新增代理` : '新增代理';
  const nextLevel = selectedParent ? selectedParent.level + 1 : null;
  const lockedParentLevel = lockedParent?.level ?? selectedParent?.level;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} subtitle="新增下级代理" width="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {lockedParent ? (
          <div className="rounded-md border border-[#C9A247]/35 bg-[#FFF8DA] px-4 py-3">
            <input type="hidden" {...register('parentId')} />
            <div className="label mb-1">上级代理</div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-900">
              <span className="font-mono">{lockedParent.username}</span>
              {lockedParentLevel !== undefined && (
                <span className="tag tag-acid">L{lockedParentLevel}</span>
              )}
              {nextLevel !== null && <span className="tag tag-gold">新代理 L{nextLevel}</span>}
              <span className="text-[11px] font-normal text-ink-500">
                本代理会建立在当前层级下面
              </span>
            </div>
          </div>
        ) : (
          <Field label="上级代理" code="01" error={errors.parentId?.message}>
            <select {...register('parentId')} className="term-input">
              <option value="">— 选择上级 —</option>
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="账号" code="02" error={errors.username?.message}>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              {...register('username')}
              className="term-input font-mono"
              placeholder="请输入代理账号"
            />
          </Field>
          <Field label="密码" code="03" error={errors.password?.message}>
            <input
              type="password"
              {...register('password')}
              className="term-input"
              placeholder="至少 8 位，含英数"
            />
          </Field>
        </div>

        <Field label="显示名称" code="04" error={errors.displayName?.message}>
          <input
            type="text"
            {...register('displayName')}
            className="term-input"
            placeholder="选填"
          />
        </Field>

        <RebateEditor
          title="电子退水"
          codePrefix="05"
          description={
            electronicParentMaxPct === null
              ? '读取当前层级可分配退水中。'
              : `当前层级最多可往下分配 ${electronicParentMaxPct.toFixed(2)}%。`
          }
          modeError={errors.rebateMode?.message}
          amountError={errors.rebatePercentageDisplay?.message}
          modeRegister={register('rebateMode')}
          amountRegister={register('rebatePercentageDisplay')}
          mode={watchedRebateMode}
          parentMaxPct={electronicParentMaxPct}
        />

        <Field label="限红等级" code="07" error={errors.bettingLimitLevel?.message}>
          <select {...register('bettingLimitLevel')} className="term-input">
            <option value="range_1_500">1-500</option>
            <option value="range_50_1000">50-1000</option>
            <option value="range_100_2000">100-2000</option>
            <option value="range_500_5000">500-5000</option>
            <option value="range_1000_10000">1000-10000</option>
            <option value="range_5000_50000">5000-50000</option>
          </select>
        </Field>

        <Field label="备注" code="08" error={errors.notes?.message}>
          <textarea
            rows={2}
            {...register('notes')}
            className="term-input resize-none"
            placeholder="备注说明（选填）"
          />
        </Field>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
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

function RebateEditor({
  title,
  codePrefix,
  description,
  modeError,
  amountError,
  modeRegister,
  amountRegister,
  mode,
  parentMaxPct,
}: {
  title: string;
  codePrefix: string;
  description: string;
  modeError?: string;
  amountError?: string;
  modeRegister: UseFormRegisterReturn;
  amountRegister: UseFormRegisterReturn;
  mode: RebateMode;
  parentMaxPct: number | null;
}): JSX.Element {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-100/30 p-4">
      <div className="mb-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-ink-700">{title}</div>
        <div className="mt-1 text-[11px] text-ink-500">{description}</div>
      </div>

      <Field label="退水模式" code={codePrefix} error={modeError}>
        <select {...modeRegister} className="term-input">
          <option value="PERCENTAGE">按比例分配</option>
          <option value="ALL">全拿退水</option>
          <option value="NONE">全退下级</option>
        </select>
      </Field>

      {mode !== 'PERCENTAGE' && (
        <div className="mt-3 rounded-md border border-ink-200 bg-ink-100/40 px-3 py-2 text-[11px] text-ink-600">
          {mode === 'ALL'
            ? '本级代理保留全部可用退水，下级可分配退水为 0%。'
            : `本级代理不保留退水，下级可分配退水为 ${(parentMaxPct ?? 0).toFixed(2)}%。`}
        </div>
      )}

      {mode === 'PERCENTAGE' && parentMaxPct !== null && (
        <div className="mt-3">
          <Field
            label={`退水比例（%，上限 ${parentMaxPct.toFixed(2)}%）`}
            code={(Number.parseInt(codePrefix, 10) + 1).toString().padStart(2, '0')}
            error={amountError}
          >
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                {...amountRegister}
                className="term-input font-mono pr-8"
                placeholder="例如 0.50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-500">
                %
              </span>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

function normalizeBettingLimit(
  value: string | null | undefined,
): FormInput['bettingLimitLevel'] | null {
  const legacy: Record<string, string> = {
    level1: 'range_1_500',
    level2: 'range_50_1000',
    level3: 'range_100_2000',
    level4: 'range_1000_10000',
    level5: 'range_5000_50000',
    unlimited: 'range_5000_50000',
  };
  if (value && legacy[value]) return legacy[value];
  if (
    value === 'range_1_500' ||
    value === 'range_50_1000' ||
    value === 'range_100_2000' ||
    value === 'range_500_5000' ||
    value === 'range_1000_10000' ||
    value === 'range_5000_50000'
  ) {
    return value;
  }
  return null;
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
