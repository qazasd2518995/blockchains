import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

export interface AnnouncementRow {
  id: string;
  content: string;
  kind: 'marquee' | 'popup';
  priority: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** 傳入時為 edit 模式，否則 create 模式 */
  editing?: AnnouncementRow | null;
}

type Kind = 'marquee' | 'popup';

// HTML datetime-local 需要 'YYYY-MM-DDTHH:mm'（無時區）
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 'YYYY-MM-DDTHH:mm' → ISO string；空字串回 null
function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AnnouncementFormModal({ open, onClose, onDone, editing }: Props): JSX.Element {
  const isEdit = Boolean(editing);
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<Kind>('marquee');
  const [priority, setPriority] = useState<string>('0');
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setContent(editing.content);
      setKind(editing.kind);
      setPriority(String(editing.priority));
      setIsActive(editing.isActive);
      setStartsAt(toLocalInput(editing.startsAt));
      setEndsAt(toLocalInput(editing.endsAt));
    } else {
      setContent('');
      setKind('marquee');
      setPriority('0');
      setIsActive(true);
      setStartsAt('');
      setEndsAt('');
    }
    setErr(null);
  }, [open, editing]);

  const submit = async (): Promise<void> => {
    const trimmed = content.trim();
    if (!trimmed) {
      setErr('請填寫公告內容');
      return;
    }
    if (trimmed.length > 500) {
      setErr('內容長度不得超過 500 字');
      return;
    }
    const prio = Number.parseInt(priority, 10);
    if (!Number.isFinite(prio)) {
      setErr('優先級必須是整數');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        content: trimmed,
        kind,
        priority: prio,
        isActive,
      };
      const s = fromLocalInput(startsAt);
      const e = fromLocalInput(endsAt);
      if (isEdit) {
        // edit: 空字串 → null 清除；有值 → 新 ISO
        payload.startsAt = s;
        payload.endsAt = e;
        await adminApi.patch(`/announcements/${editing!.id}`, payload);
      } else {
        if (s) payload.startsAt = s;
        if (e) payload.endsAt = e;
        await adminApi.post('/announcements', payload);
      }
      onDone();
      onClose();
    } catch (ex) {
      setErr(extractApiError(ex).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '編輯公告' : '新增公告'}
      subtitle={isEdit ? 'Edit Announcement' : 'New Announcement'}
      width="md"
    >
      <div className="space-y-4">
        <label className="block">
          <div className="label mb-2">公告內容（最多 500 字）</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={500}
            className="term-input w-full resize-none"
            placeholder="輸入要顯示的公告文字"
          />
          <div className="mt-1 text-right text-[10px] text-ink-500">
            {content.length} / 500
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">類型</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="radio"
                  name="kind"
                  value="marquee"
                  checked={kind === 'marquee'}
                  onChange={() => setKind('marquee')}
                />
                跑馬燈
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="radio"
                  name="kind"
                  value="popup"
                  checked={kind === 'popup'}
                  onChange={() => setKind('popup')}
                />
                彈窗
              </label>
            </div>
          </div>

          <label className="block">
            <div className="label mb-2">優先級（數字越大越前面）</div>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="term-input font-mono"
              step="1"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="label mb-2">生效起始（可留空 = 立即）</div>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="term-input font-mono"
            />
          </label>
          <label className="block">
            <div className="label mb-2">生效結束（可留空 = 永久）</div>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="term-input font-mono"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          立即啟用
        </label>

        {err && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
            ⚠ {err}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button type="button" onClick={submit} disabled={busy} className="btn-acid">
            {isEdit ? '→ 儲存' : '→ 建立'}
          </button>
          <button type="button" onClick={onClose} className="btn-teal-outline">
            [取消]
          </button>
        </div>
      </div>
    </Modal>
  );
}
