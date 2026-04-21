import { Megaphone } from 'lucide-react';
import { FAKE_ANNOUNCEMENTS } from '@/data/fakeAnnouncements';

export function AnnouncementTicker() {
  // 重複兩倍以讓 translateX -50% 無縫循環
  const doubled = [...FAKE_ANNOUNCEMENTS, ...FAKE_ANNOUNCEMENTS];
  return (
    <div className="flex h-9 items-center overflow-hidden border-b border-[#E5E7EB] bg-white">
      <div className="flex shrink-0 items-center gap-1 border-r border-[#E5E7EB] bg-[#F5F7FA] px-3 text-[13px] font-semibold text-[#D4574A]">
        <Megaphone className="h-4 w-4" />
        <span>最新公告</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((msg, i) => (
            <span
              key={i}
              className="mx-6 text-[13px] text-[#D4574A] whitespace-nowrap"
            >
              {msg}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
