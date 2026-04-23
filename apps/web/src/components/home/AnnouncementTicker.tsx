import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { FAKE_ANNOUNCEMENTS } from '@/data/fakeAnnouncements';
import { TICKER_ICONS } from '@/lib/platformIcons';

const ROTATE_INTERVAL = 3200;
const VISIBLE_ROWS = 6;
const ROW_HEIGHT = 56;
const REFETCH_INTERVAL = 60_000;

interface PublicAnnouncement {
  id: string;
  content: string;
  priority: number;
  createdAt: string;
}

export function AnnouncementTicker() {
  const Icon = TICKER_ICONS.announcement;
  const [offset, setOffset] = useState(0);
  const [messages, setMessages] = useState<string[]>(FAKE_ANNOUNCEMENTS);

  useEffect(() => {
    let cancelled = false;
    const fetchAnnouncements = async () => {
      try {
        const res = await api.get<{ items: PublicAnnouncement[] }>(
          '/public/announcements',
          { params: { kind: 'marquee' } },
        );
        if (cancelled) return;
        const sorted = [...res.data.items].sort((a, b) => b.priority - a.priority);
        const contents = sorted.map((item) => item.content).filter((c) => c.trim().length > 0);
        if (contents.length > 0) {
          setMessages(contents);
        }
      } catch {
        // API 失敗時保留現有訊息（初次載入時即 FAKE_ANNOUNCEMENTS fallback）
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

  useEffect(() => {
    if (messages.length === 0) return;
    const id = setInterval(() => {
      setOffset((prev) => (prev + 1) % messages.length);
    }, ROTATE_INTERVAL);
    return () => clearInterval(id);
  }, [messages.length]);

  useEffect(() => {
    // messages 改變時重置 offset 避免超出範圍
    setOffset(0);
  }, [messages.length]);

  const loop = [...messages, ...messages];

  return (
    <aside
      aria-label="最新公告"
      className="pointer-events-none fixed right-3 top-1/2 z-30 hidden w-[260px] -translate-y-1/2 xl:block 2xl:right-6 2xl:w-[280px]"
    >
      <div className="pointer-events-auto overflow-hidden rounded-[18px] border border-[#F1D8C8] bg-[#FFFDF9]/95 shadow-[0_18px_40px_rgba(196,84,57,0.18)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-[#F1D8C8] bg-[#FFF3EE] px-4 py-2.5 text-[13px] font-semibold text-[#C45439]">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>最新公告</span>
        </div>
        <div
          className="relative overflow-hidden"
          style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
        >
          <div
            className="flex flex-col transition-transform duration-700 ease-out"
            style={{ transform: `translateY(-${offset * ROW_HEIGHT}px)` }}
          >
            {loop.map((msg, i) => (
              <div
                key={`${msg}-${i}`}
                className="flex items-center gap-2 border-b border-[#FBE8DD] px-4 text-[13px] leading-snug text-[#C45439] last:border-b-0"
                style={{ height: ROW_HEIGHT }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#D0AC4D]" aria-hidden="true" />
                <span className="line-clamp-2">{msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
