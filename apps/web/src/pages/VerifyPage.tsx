import { ShieldCheck } from 'lucide-react';

export function VerifyPage() {
  return (
    <div className="mx-auto max-w-[720px] py-10">
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-[#186073]" />
          <h1 className="text-[24px] font-bold text-[#0F172A]">Provably Fair 驗證</h1>
        </div>
        <p className="text-[14px] leading-relaxed text-[#4A5568]">
          本平台所有遊戲結果均由 HMAC-SHA256 演算法生成，每局皆可獨立驗證。
          Server Seed 會在揭露後公開，玩家可使用 Server Seed + Client Seed + Nonce 重現結果。
        </p>
        <div className="mt-6 rounded-[6px] bg-[#F5F7FA] p-4 text-[13px] text-[#4A5568]">
          <div className="font-semibold text-[#0F172A]">驗證工具開發中</div>
          <div className="mt-1 text-[12px] text-[#9CA3AF]">
            可到「遊戲紀錄」查看歷史 seed，或使用第三方 HMAC 驗證器自行比對
          </div>
        </div>
      </div>
    </div>
  );
}
