interface Badge {
  id: string;
  label: string;
  sub: string;
}

const BADGES: Badge[] = [
  { id: 'fair',   label: 'Fair Play',       sub: '公平認證' },
  { id: 'ssl',    label: 'SSL 256-bit',     sub: '加密傳輸' },
  { id: 'audit',  label: 'Auditable',       sub: '可審計' },
  { id: '18',     label: '18+',             sub: '年齡限制' },
  { id: 'pf',     label: 'Provably Fair',   sub: 'HMAC-SHA256' },
  { id: 'resp',   label: 'Responsible',     sub: '負責任博彩' },
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
