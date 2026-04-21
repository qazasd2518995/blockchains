import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getDriftedOnlineCount } from '@/data/fakeStats';

export function FloatingSupport() {
  const [online, setOnline] = useState<number>(() => getDriftedOnlineCount());
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setOnline(getDriftedOnlineCount()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#186073] text-white shadow-[0_8px_20px_rgba(24,96,115,0.35)] transition hover:bg-[#1E7A90]"
          aria-label="客服"
        >
          <MessageCircle className="h-7 w-7" />
        </button>
        <div className="flex h-10 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <span className="dot-online" />
          <span className="text-[12px] text-[#4A5568]">
            在线 <span className="num font-semibold text-[#0F172A]">{online.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div
            className="relative w-[420px] max-w-[92vw] rounded-[10px] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute right-3 top-3 text-[#4A5568] hover:text-[#0F172A]"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-4 text-[18px] font-semibold text-[#0F172A]">联系客服</h3>
            <div className="space-y-3">
              <a
                href="https://line.me/ti/p/~@aaa1788"
                target="_blank"
                rel="noreferrer"
                className="block rounded-[6px] border border-[#E5E7EB] p-3 hover:border-[#186073] hover:bg-[#F5F7FA]"
              >
                <div className="text-[14px] font-semibold text-[#0F172A]">LINE 官方</div>
                <div className="text-[12px] text-[#4A5568]">@aaa1788</div>
              </a>
              <a
                href="https://t.me/aaawin1788_bot"
                target="_blank"
                rel="noreferrer"
                className="block rounded-[6px] border border-[#E5E7EB] p-3 hover:border-[#186073] hover:bg-[#F5F7FA]"
              >
                <div className="text-[14px] font-semibold text-[#0F172A]">Telegram</div>
                <div className="text-[12px] text-[#4A5568]">aaawin1788_bot</div>
              </a>
              <div className="rounded-[6px] border border-dashed border-[#E5E7EB] p-3 text-[12px] text-[#9CA3AF]">
                回复时间：24 小时
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
