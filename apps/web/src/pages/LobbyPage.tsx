import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HALL_LIST } from '@/data/halls';
import { FAKE_TODAY_TOP10 } from '@/data/fakeStats';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const totalGames = new Set(HALL_LIST.flatMap((hall) => hall.gameIds)).size;
const topBoardWin = Math.max(...FAKE_TODAY_TOP10.map((row) => row.win));

export function LobbyPage() {
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8 2xl:col-span-9">
          <HeroBanner />

          <section className="rounded-[28px] border border-white/[0.65] bg-white/[0.92] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="label">Lobby Overview</div>
                <h1 className="mt-3 text-pretty text-[30px] font-bold leading-tight text-[#0F172A]">
                  從館別切節奏，或直接驗證最近一局。
                </h1>
                <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[#4A5568]">
                  這個大廳不再把所有遊戲硬塞成單一入口。先選 Crash、經典或策略，再往下鑽；如果要核對結果，直接打開公平驗證頁。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to="/hall/classic" className="btn-teal text-[13px]">
                  前往經典館
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/verify"
                  className="btn-chip border-[#0F172A]/10 bg-[#0F172A] text-white hover:border-[#0F172A] hover:bg-[#1A2530]"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  公平驗證
                </Link>
                <Link
                  to="/history"
                  className="btn-chip border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#186073]/30 hover:bg-[#F5F7FA]"
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                  遊戲記錄
                </Link>
              </div>
            </div>
          </section>
        </div>

        <aside className="grid gap-4 sm:grid-cols-3 xl:col-span-4 xl:grid-cols-1 2xl:col-span-3">
          <LobbyStatCard label="遊戲館別" value={String(HALL_LIST.length)} detail="Crash、經典、策略三種節奏入口" />
          <LobbyStatCard label="上架遊戲" value={String(totalGames)} detail="大廳先分館，再進單一遊戲頁" />
          <LobbyStatCard label="今日榜首" value={numberFormatter.format(topBoardWin)} detail="依戰報更新假幣榜單，方便確認 UI 節奏" />
        </aside>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Game Floors"
          title="依遊戲節奏挑選館別"
          description="Crash 館偏倍率與收手時機，經典館偏短局與頻率，策略館則需要更多資訊判斷。入口先分類，能減少新玩家的選擇負擔。"
          rightSlot={
            <Link
              to="/verify"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
            >
              先看驗證工具
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
        <HallEntrances />
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Live Board"
          title="今日戰報與平台節奏"
          description="榜單用來驗證表格密度、數字呈現與手機橫向閱讀。旁邊的 CTA 保留兩條主路徑：核對結果，或回看自己的歷史局數。"
        />

        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 2xl:col-span-9">
            <TodayWinners />
          </div>

          <aside className="space-y-4 xl:col-span-4 2xl:col-span-3">
            <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="label">Quick Paths</div>
              <h3 className="mt-3 text-[22px] font-bold text-[#0F172A]">常用動作維持在同一區。</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">
                大廳要先解決的是方向，不是資訊量。把常用動作固定在旁邊，玩家不用在不同頁面重新找入口。
              </p>
              <div className="mt-5 space-y-3">
                <Link to="/verify" className="btn-teal w-full justify-center text-[13px]">
                  立即驗證上一局
                </Link>
                <Link
                  to="/history"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#E5E7EB] px-4 py-3 text-[13px] font-semibold text-[#0F172A] transition hover:border-[#186073]/30 hover:bg-[#F5F7FA]"
                >
                  查看遊戲記錄
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Platform Signals"
          title="把信任訊號放在內容後段，不搶主路徑"
          description="公平驗證、加密、客服與負責任遊玩仍然重要，但它們應該補強決策，而不是打斷玩家先進入館別的流程。"
        />
        <FeaturesStrip />
        <PartnerLogos />
      </section>
    </div>
  );
}

function LobbyStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="label">{label}</div>
      <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">{value}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{detail}</p>
    </article>
  );
}
