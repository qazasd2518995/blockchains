import { Link, Navigate } from 'react-router-dom';
import { LogIn, UserPlus, MessageCircle, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { HeroBanner } from '@/components/home/HeroBanner';
import { GuestHallEntrances } from '@/components/home/GuestHallEntrances';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';
import { FloatingSupport } from '@/components/layout/FloatingSupport';

export function LandingPage() {
  const { accessToken } = useAuthStore();
  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* 未登入 TopBar */}
      <header className="sticky top-0 z-40 bg-[#1A2530] text-white shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[18px] font-bold text-white/90 sm:inline">娱乐城</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[14px] text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <LogIn className="h-4 w-4" />
              登录
            </Link>
            <a
              href="https://line.me/ti/p/~@aaa1788"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[6px] bg-[#C9A247] px-3 py-1.5 text-[14px] font-semibold text-[#1A2530] transition hover:bg-[#AE8B35]"
            >
              <UserPlus className="h-4 w-4" />
              注册
            </a>
          </div>
        </div>
      </header>

      {/* 双跑马灯 */}
      <AnnouncementTicker />
      <WinTicker />

      {/* 内容 */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] space-y-8 px-5 py-6">
          <HeroBanner />
          <GuestHallEntrances />
          <FeaturesStrip />
          <PartnerLogos />

          {/* Join CTA */}
          <section className="rounded-[10px] border border-[#186073]/30 bg-gradient-to-br from-[#186073] to-[#0E4555] p-8 text-white shadow-[0_8px_20px_rgba(24,96,115,0.25)]">
            <div className="mx-auto max-w-[720px] text-center">
              <h2 className="text-[26px] font-bold">立即加入 BG 娱乐城</h2>
              <p className="mt-2 text-[14px] text-white/85">
                仅限代理邀请开通，请联系客服取得邀请码
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                  href="https://line.me/ti/p/~@aaa1788"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[6px] bg-[#C9A247] px-5 py-2.5 text-[14px] font-semibold text-[#1A2530] transition hover:bg-[#AE8B35]"
                >
                  <MessageCircle className="h-4 w-4" />
                  联系 LINE 客服
                </a>
                <a
                  href="https://t.me/aaawin1788_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[6px] border border-white/40 bg-white/10 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/20"
                >
                  <Send className="h-4 w-4" />
                  联系 Telegram 客服
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#E5E7EB] bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-5 py-8 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">快捷连结</h4>
            <ul className="space-y-2 text-[13px] text-[#4A5568]">
              <li><Link to="/login" className="hover:text-[#186073]">会员登录</Link></li>
              <li><a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="hover:text-[#186073]">联络客服</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">社群</h4>
            <div className="flex gap-3 text-[13px]">
              <a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">LINE</a>
              <a href="https://t.me/aaawin1788_bot" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Telegram</a>
              <a href="https://www.instagram.com/aaa1788_com/" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Instagram</a>
            </div>
            <p className="mt-4 text-[11px] text-[#9CA3AF]">
              18+ 负责任博彩 · 本站为技术研究用假币平台，不涉及真实金流
            </p>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-[#9CA3AF]">
              Copyright © 2026 BG Gaming. All Rights Reserved.
            </div>
            <div className="mt-1 text-[11px] text-[#9CA3AF]">v1.0.1</div>
          </div>
        </div>
      </footer>

      <FloatingSupport />
    </div>
  );
}
