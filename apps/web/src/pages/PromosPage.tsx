import { Gift } from 'lucide-react';

const PROMOS = [
  { id: 'week',    title: '每週倍率王',     desc: '週一至週日累積倍率排名，前 10 名分享獎金池', badge: '熱門' },
  { id: 'vip',     title: 'VIP 等級制度',   desc: '依遊戲量自動升等，享專屬返水與活動',        badge: '制度' },
  { id: 'jackpot', title: 'Crash 彩池',    desc: 'JetX3 全館累積，任意局觸發 100× 即爆池',     badge: '彩池' },
  { id: 'friend',  title: '邀請好友',      desc: '好友遊戲量回饋，介紹越多回饋越高',           badge: '推廣' },
];

export function PromosPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Gift className="h-8 w-8 text-[#186073]" />
        <h1 className="text-[28px] font-bold text-[#0F172A]">活動優惠</h1>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PROMOS.map((p) => (
          <div
            key={p.id}
            className="rounded-[10px] border border-[#E5E7EB] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition hover:border-[#186073]"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-[4px] bg-[#C9A247] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                {p.badge}
              </span>
            </div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">{p.title}</h3>
            <p className="mt-1 text-[13px] text-[#4A5568]">{p.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-[12px] text-[#9CA3AF]">
        * 本頁面為設計占位，正式活動規則以實際公告為準
      </p>
    </div>
  );
}
