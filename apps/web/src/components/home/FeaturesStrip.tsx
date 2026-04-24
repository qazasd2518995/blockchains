import { ShieldCheck, Lock, Zap, Clock3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: ShieldCheck, title: '稳定可靠',   desc: '顶级游戏引擎，体验流畅无延迟' },
  { icon: Lock,        title: '加密保障',   desc: '128 位加密传输，资料安全无虞' },
  { icon: Zap,         title: '秒速派彩',   desc: '注单结算即时到点，绝不延迟' },
  { icon: Clock3,      title: '24H 开放',   desc: '随时登入大厅，热门玩法全天候开放' },
];

export function FeaturesStrip() {
  return (
    <section className="grid grid-cols-2 gap-4 rounded-[10px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.06)] md:grid-cols-4">
      {FEATURES.map((f) => {
        const Icon = f.icon;
        return (
          <div key={f.title} className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F1F4] text-[#186073]">
              <Icon className="h-6 w-6" />
            </div>
            <div className="text-[15px] font-semibold text-[#0F172A]">{f.title}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[#4A5568]">{f.desc}</div>
          </div>
        );
      })}
    </section>
  );
}
