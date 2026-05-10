import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { TICKER_ICONS } from '@/lib/platformIcons';

const REFETCH_INTERVAL = 60_000;

interface PublicAnnouncement {
  id: string;
  content: string;
  priority: number;
  createdAt: string;
}

export function AnnouncementTicker() {
  const { t } = useTranslation();
  const Icon = TICKER_ICONS.announcement;
  const [remoteMessages, setRemoteMessages] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAnnouncements = async () => {
      try {
        const res = await api.get<{ items: PublicAnnouncement[] }>('/public/announcements', {
          params: { kind: 'marquee' },
        });
        if (cancelled) return;
        const sorted = [...res.data.items].sort((a, b) => b.priority - a.priority);
        const contents = sorted.map((item) => item.content).filter((c) => c.trim().length > 0);
        if (contents.length > 0) {
          setRemoteMessages(contents);
        }
      } catch {
        // API 失敗時保留本地 fallback。
      }
    };
    void fetchAnnouncements();
    const id = setInterval(() => {
      void fetchAnnouncements();
    }, REFETCH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const messages = remoteMessages ?? t.announcements.items;
  const loop = [...messages, ...messages];

  return (
    <div
      aria-label={t.announcements.latest}
      className="min-w-0 overflow-hidden rounded-full border border-white/10 bg-[#162338]/86 text-white/82 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
    >
      <div className="flex min-h-8 items-center gap-2 px-3 py-1.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#E8D48A]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {t.announcements.latest}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ticker-track gap-7 [--ticker-duration:54s]">
            {loop.map((msg, i) => (
              <span
                key={`${msg}-${i}`}
                className="inline-flex items-center gap-1.5 text-[11px] leading-none text-white/75"
              >
                <Sparkles className="h-3 w-3 shrink-0 text-[#D0AC4D]" aria-hidden="true" />
                {msg}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
