interface Badge {
  id: string;
  label: string;
  sub: string;
}

const BADGES: Badge[] = [
  { id: 'fair',   label: 'Fair Play',       sub: '公平认证' },
  { id: 'ssl',    label: 'SSL 256-bit',     sub: '加密传输' },
  { id: 'audit',  label: '24/7 Service',    sub: '全天候服务' },
  { id: '18',     label: '18+',             sub: '年龄限制' },
  { id: 'pf',     label: 'Premium Quality', sub: '顶级品质' },
  { id: 'resp',   label: 'Responsible',     sub: '负责任博彩' },
];

export function PartnerLogos() {
  return (
    <section className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-[10px] border border-[#E5E7EB] bg-[#F5F7FA] px-6 py-6">
      {BADGES.map((b) => (
        <div
          key={b.id}
          className="flex min-w-[120px] flex-col items-center text-center opacity-70 transition hover:opacity-100"
        >
          <div className="text-[15px] font-semibold text-[#186073]">{b.label}</div>
          <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{b.sub}</div>
        </div>
      ))}
    </section>
  );
}
