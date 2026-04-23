import { Gift } from 'lucide-react';

const PROMOS = [
  { id: 'week',    title: '每周倍率王',     desc: '周一至周日累计倍率排名，前 10 名分享奖金池', badge: '热门' },
  { id: 'vip',     title: 'VIP 等级制度',   desc: '依游戏量自动升等，享专属返水与活动',        badge: '制度' },
  { id: 'jackpot', title: 'Crash 彩池',    desc: 'JetX3 全馆累计，任意局触发 100× 即爆池',     badge: '彩池' },
  { id: 'friend',  title: '邀请好友',      desc: '好友游戏量回馈，介绍越多回馈越高',           badge: '推广' },
];

export function PromosPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Gift className="h-8 w-8 text-[#186073]" />
        <h1 className="text-[28px] font-bold text-[#0F172A]">活动优惠</h1>
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
    </div>
  );
}
