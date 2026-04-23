import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import {
  AnnouncementFormModal,
  type AnnouncementRow,
} from '@/components/shared/AnnouncementFormModal';
import { useTranslation } from '@/i18n/useTranslation';

function formatDT(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-Hans-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

export function AnnouncementsPage(): JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await adminApi.get<{ items: AnnouncementRow[] }>('/announcements');
      setItems(res.data.items);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = (): void => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (row: AnnouncementRow): void => {
    setEditing(row);
    setFormOpen(true);
  };
  const toggleRow = async (id: string, isActive: boolean): Promise<void> => {
    try {
      await adminApi.patch(`/announcements/${id}/toggle`, { isActive: !isActive });
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };
  const deleteRow = async (id: string): Promise<void> => {
    if (!window.confirm('確定刪除此公告？')) return;
    try {
      await adminApi.delete(`/announcements/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const cols: Column<AnnouncementRow>[] = [
    {
      key: 'content',
      label: '內容',
      render: (r) => (
        <span className="text-[12px] text-ink-800" title={r.content}>
          {truncate(r.content, 40)}
        </span>
      ),
    },
    {
      key: 'kind',
      label: '類型',
      render: (r) =>
        r.kind === 'marquee' ? (
          <span className="tag tag-acid">跑馬燈</span>
        ) : (
          <span className="tag tag-amber">彈窗</span>
        ),
    },
    {
      key: 'priority',
      label: '優先級',
      align: 'right',
      render: (r) => <span className="data-num">{r.priority}</span>,
    },
    {
      key: 'status',
      label: '狀態',
      render: (r) =>
        r.isActive ? (
          <span className="tag tag-toxic">{t.controls.active}</span>
        ) : (
          <span className="tag tag-ember">{t.controls.off}</span>
        ),
    },
    {
      key: 'window',
      label: '生效時間',
      render: (r) => (
        <div className="font-mono text-[10px] text-ink-600">
          <div>起 {formatDT(r.startsAt)}</div>
          <div>迄 {formatDT(r.endsAt)}</div>
        </div>
      ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button type="button" onClick={() => openEdit(r)} className="btn-teal-outline px-2 py-1">
            編輯
          </button>
          <button
            type="button"
            onClick={() => toggleRow(r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '啟用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow(r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 08"
        breadcrumb="公告管理 / 列表"
        title="公告管理"
        titleSuffix="跑馬燈 / 彈窗"
        titleSuffixColor="amber"
        description="管理玩家端顯示的跑馬燈與彈窗公告。啟用後立即對所有玩家生效；可設定優先級與生效時間區間。"
        rightSlot={
          <button
            type="button"
            onClick={openCreate}
            className="btn-acid flex items-center gap-1.5 text-[12px]"
          >
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />+ 新增公告
          </button>
        }
      />

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <DataTable columns={cols} rows={items} rowKey={(r) => r.id} empty={t.common.empty} />
      )}

      <AnnouncementFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onDone={() => void reload()}
        editing={editing}
      />
    </div>
  );
}
