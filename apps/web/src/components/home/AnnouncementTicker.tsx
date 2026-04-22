import { Sparkles } from 'lucide-react';
import { FAKE_ANNOUNCEMENTS } from '@/data/fakeAnnouncements';
import { TICKER_ICONS } from '@/lib/platformIcons';

export function AnnouncementTicker() {
  const Icon = TICKER_ICONS.announcement;
  // 重复兩倍以让 translateX -50% 无縫循環
  const doubled = [...FAKE_ANNOUNCEMENTS, ...FAKE_ANNOUNCEMENTS];
  return (
    <div className="flex h-10 items-center overflow-hidden border-b border-[#E2E8F0] bg-[#FFFDF9] shadow-[inset_0_-1px_0_rgba(226,232,240,0.9)]">
      <div className="flex shrink-0 items-center gap-2 border-r border-[#F1D8C8] bg-[#FFF3EE] px-4 text-[13px] font-semibold text-[#C45439]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>最新公告</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track [--ticker-duration:40s]">
          {doubled.map((msg, i) => (
            <span key={`${msg}-${i}`} className="ml-6 inline-flex items-center gap-3 whitespace-nowrap text-[13px] font-medium text-[#C45439]">
              <Sparkles className="h-3.5 w-3.5 text-[#D0AC4D]" aria-hidden="true" />
              <span>{msg}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
