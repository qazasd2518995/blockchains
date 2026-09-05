import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  label: string;
  active: boolean;
  completed?: boolean;
  busy: boolean;
  readOnly?: boolean;
  error?: string;
  onToggle: () => Promise<void>;
  onDelete: () => Promise<boolean>;
}

/** Deactivation is reversible. Deletion always requires a separate dialog action. */
export function RuleRowActions({
  label,
  active,
  completed,
  busy,
  readOnly,
  error,
  onToggle,
  onDelete,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (readOnly) return <span className="text-ink-500">唯讀</span>;
  return (
    <div className="flex justify-end gap-2 text-[11px]">
      <button
        type="button"
        disabled={busy || completed}
        title={
          completed ? '此規則已完成；如需再次執行，請新增控制，不會重設已結算進度。' : undefined
        }
        onClick={() => void onToggle()}
        className="btn-teal-outline min-h-10 whitespace-nowrap px-3 py-2 disabled:opacity-50"
      >
        {completed ? '已完成' : active ? '停用' : '啟用'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirmDelete(true)}
        className="btn-teal-outline min-h-10 whitespace-nowrap border-[#D4574A]/40 px-3 py-2 text-[#D4574A] disabled:opacity-50"
      >
        刪除
      </button>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        busy={busy}
        title="確認刪除規則"
        subtitle={label}
        width="sm"
      >
        <p className="text-sm">刪除後無法用「啟用」還原。若只想暫停，請取消並使用「停用」。</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[#D4574A]">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="btn-teal-outline"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await onDelete()) setConfirmDelete(false);
            }}
            className="btn-acid"
          >
            {busy ? '處理中…' : '確認刪除'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
