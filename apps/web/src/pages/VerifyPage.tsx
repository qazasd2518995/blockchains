import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { SectionHeading } from '@/components/layout/SectionHeading';

type HallKey = 'crash' | 'classic' | 'strategy';

interface Hall {
  key: HallKey;
  title: string;
  subtitle: string;
  tone: string;
  intro: string;
  vibe: string;
}

const HALLS: Hall[] = [
  {
    key: 'crash',
    title: '飛行館',
    subtitle: 'Crash Hall',
    tone: '#C9A247',
    intro: '倍率隨時間一路拉升，看準時機按下領獎，越晚收手獎金越高。',
    vibe: '心跳同步、節奏緊湊',
  },
  {
    key: 'classic',
    title: '經典館',
    subtitle: 'Classic Hall',
    tone: '#186073',
    intro: '骰子、輪盤、老虎機等熟悉玩法，規則直觀，適合連玩不停。',
    vibe: '上手即贏、輕鬆順手',
  },
  {
    key: 'strategy',
    title: '策略館',
    subtitle: 'Strategy Hall',
    tone: '#5B8C40',
    intro: '靠判斷與膽識放大倍率，每一個選擇都會影響獎金的走向。',
    vibe: '腦力對決、越拚越上頭',
  },
];

interface Game {
  id: string;
  hall: HallKey;
  name: string;
  english: string;
  cover: string;
  rtp: string;
  maxMultiplier: string;
  duration: string;
  intro: string;
  howToPlay: string[];
  tips: string;
}

const GAMES: Game[] = [
  {
    id: 'rocket',
    hall: 'crash',
    name: '火箭',
    english: 'Rocket',
    cover: '/games/rocket.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–30 秒',
    intro: '火箭起飛後倍率持續攀升，在爆炸前點下領獎即可帶走當局獎金。',
    howToPlay: [
      '下注前可預設自動領獎倍率，倍率一觸發系統即自動結算。',
      '火箭爆炸瞬間若仍未領獎，當局視為輸局。',
      '可在飛行途中隨時手動領獎，倍率以該瞬間為準。',
    ],
    tips: '建議搭配自動領獎，確保高速行情下不錯過收獎時機。',
  },
  {
    id: 'aviator',
    hall: 'crash',
    name: '飛行員',
    english: 'Aviator',
    cover: '/games/aviator.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–30 秒',
    intro: 'Crash 玩法經典代表，飛機起飛後沿著倍率曲線爬升。',
    howToPlay: [
      '一局可同時投注兩注，分別設定不同領獎倍率。',
      '飛機消失前未領獎，該注視為輸。',
      '支援「自動下注」連投模式，固定金額連續開局。',
    ],
    tips: '雙注並行是進階玩法：一注保守領獎，另一注追高倍率。',
  },
  {
    id: 'jetx',
    hall: 'crash',
    name: '飆速 X',
    english: 'JetX',
    cover: '/games/jetx.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–30 秒',
    intro: '噴射機 Crash 玩法，畫面更快、節奏更緊湊。',
    howToPlay: [
      '與 Aviator 操作相同，按下下注後等待飛機起飛。',
      '倍率達到目標時點擊領獎，或交給自動領獎執行。',
      '飛機爆炸代表當局結束。',
    ],
    tips: '節奏較快的玩家可優先選擇 JetX，每局時間更短。',
  },
  {
    id: 'jetx3',
    hall: 'crash',
    name: '噴射機 X3',
    english: 'JetX3',
    cover: '/games/jetx3.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '8–35 秒',
    intro: '同一局三架噴射機同時飛行，可分別下注、分別領獎。',
    howToPlay: [
      '每架噴射機可獨立設定下注金額與自動領獎倍率。',
      '三架飛機各自獨立，互不影響爆炸時點。',
      '同步管理三注是 JetX3 的核心樂趣。',
    ],
    tips: '善用三注分散，可同時兼顧穩定收獎與追高倍率。',
  },
  {
    id: 'fleet',
    hall: 'crash',
    name: '太空艦隊',
    english: 'Space Fleet',
    cover: '/games/space-fleet.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '6–30 秒',
    intro: '科幻主題 Crash，艦隊穿越宇宙，倍率隨星圖一路推升。',
    howToPlay: [
      '操作邏輯與其他 Crash 一致，下注後等待艦隊出航。',
      '艦隊被擊毀前點擊領獎即鎖定當局獎金。',
      '介面提供清晰的倍率曲線與歷史戰報。',
    ],
    tips: '科幻視覺加上節奏明快，適合追求沉浸感的玩家。',
  },
  {
    id: 'balloon',
    hall: 'crash',
    name: '氣球',
    english: 'Balloon',
    cover: '/games/balloon.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–25 秒',
    intro: '氣球持續充氣，倍率隨體積膨脹，爆炸前領獎即贏。',
    howToPlay: [
      '下注後氣球開始充氣，倍率即時跳動。',
      '在氣球爆炸前點擊領獎，獎金以當下倍率結算。',
      '可預先設定自動領獎倍率穩定獲利。',
    ],
    tips: '氣球節奏輕鬆，適合做為熱身或穩定累積獎金。',
  },
  {
    id: 'doublex',
    hall: 'crash',
    name: '雙倍 X',
    english: 'Double X',
    cover: '/games/double-x.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–30 秒',
    intro: '雙倍率 Crash，畫面同時呈現兩條倍率曲線供你決策。',
    howToPlay: [
      '每局分別追蹤主倍率與副倍率兩條曲線。',
      '可選擇任一曲線收獎，獎金以對應倍率計算。',
      '兩條曲線互不影響，提供更多決策彈性。',
    ],
    tips: '進階玩家可用兩條曲線做風險對沖。',
  },
  {
    id: 'plinkox',
    hall: 'crash',
    name: '掉珠挑戰 X',
    english: 'Plinko X',
    cover: '/games/plinko-x.jpg',
    rtp: '97%',
    maxMultiplier: '1,000,000×',
    duration: '5–30 秒',
    intro: 'Plinko 加 Crash 混合玩法，彈珠隨倍率一路下落。',
    howToPlay: [
      '下注後彈珠開始落下，倍率跟著彈珠路徑跳動。',
      '可在彈珠落底前任意領獎，獎金以當下倍率為準。',
      '彈珠路徑由系統即時生成，每一局都不同。',
    ],
    tips: '兼具 Crash 的爽感與 Plinko 的視覺樂趣，新手友善。',
  },
  {
    id: 'dice',
    hall: 'classic',
    name: '骰子',
    english: 'Dice',
    cover: '/games/dice.jpg',
    rtp: '99%',
    maxMultiplier: '9,900×',
    duration: '單局 3 秒',
    intro: '經典骰寶玩法，預測骰子點數落在門檻上方或下方即贏。',
    howToPlay: [
      '設定門檻值（0.01–99.99）並選擇「Over」或「Under」。',
      '系統開出 0.00–100.00 的點數，符合預測即勝出。',
      '勝率越低、賠率越高，依門檻自動換算。',
    ],
    tips: '骰子 RTP 高達 99%，是長期最穩定的玩法之一。',
  },
  {
    id: 'roulette',
    hall: 'classic',
    name: '迷你輪盤',
    english: 'Mini Roulette',
    cover: '/games/mini-roulette.jpg',
    rtp: '97%',
    maxMultiplier: '36×',
    duration: '單局 8 秒',
    intro: '歐式迷你輪盤，下注號碼或紅黑、奇偶、大小皆可。',
    howToPlay: [
      '在桌面下注號碼、顏色、奇偶或區段。',
      '所有下注確認後點擊「開始旋轉」開球。',
      '球落定後依下注區自動派彩。',
    ],
    tips: '單號賠率 35:1，外圍下注勝率較高、賠率較低，依風格選擇。',
  },
  {
    id: 'wheel',
    hall: 'classic',
    name: '彩色轉輪',
    english: 'Color Wheel',
    cover: '/games/wheel.jpg',
    rtp: '97%',
    maxMultiplier: '50×',
    duration: '單局 6 秒',
    intro: '旋轉轉輪，指針停在你押注的顏色即贏。',
    howToPlay: [
      '可選擇 10、20、30、40、50 段轉輪。',
      '下注顏色後點擊「旋轉」啟動。',
      '段數越多、變化越精細，倍率分布也更細膩。',
    ],
    tips: '低風險模式收益穩定，高風險模式追求單局爆擊。',
  },
  {
    id: 'hotline',
    hall: 'classic',
    name: '霓虹熱線',
    english: 'Hotline',
    cover: '/games/hotline.jpg',
    rtp: '96%',
    maxMultiplier: '1,000×',
    duration: '單局 5 秒',
    intro: '霓虹風格老虎機，5 軸 3 列盤面，多條中獎線同時派彩。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '盤面停下後依連線自動結算獎金。',
      '可開啟自動旋轉模式連續開局。',
    ],
    tips: '搭配霓虹視覺與電子音效，適合輕鬆放鬆型玩家。',
  },
  {
    id: 'keno',
    hall: 'classic',
    name: '基諾',
    english: 'Keno',
    cover: '/games/keno.jpg',
    rtp: '96%',
    maxMultiplier: '10,000×',
    duration: '單局 5 秒',
    intro: '從 1–40 號碼中選 1–10 個，命中越多賠率越高。',
    howToPlay: [
      '在號碼盤點選 1–10 個號碼。',
      '系統開出 10 個號碼，比對命中數量。',
      '命中越多、倍率越高，依風險等級調整賠率分布。',
    ],
    tips: '低風險適合穩穩命中、高風險主打單次爆擊。',
  },
  {
    id: 'hilo',
    hall: 'strategy',
    name: '猜大小',
    english: 'Hi-Lo',
    cover: '/games/hilo.jpg',
    rtp: '99%',
    maxMultiplier: '999×',
    duration: '可連續多局',
    intro: '猜下一張牌比目前牌大或小，連對越多倍率越高。',
    howToPlay: [
      '系統發出第一張牌，預測下一張比它大或小。',
      '猜對則倍率累積，可選擇繼續或領獎。',
      '猜錯則當局結束，獎金歸零。',
    ],
    tips: '見好就收是 Hi-Lo 的核心策略，感受不對立刻領獎。',
  },
  {
    id: 'mines',
    hall: 'strategy',
    name: '掃雷',
    english: 'Mines',
    cover: '/games/mines.jpg',
    rtp: '97%',
    maxMultiplier: '24,000×',
    duration: '可連續多局',
    intro: '5×5 格子中藏著地雷，避開地雷翻開鑽石就能不斷加碼。',
    howToPlay: [
      '設定地雷數量（1–24）後開始遊戲。',
      '每翻開一格鑽石，當局倍率與獎金都會增加。',
      '隨時可選擇領獎；翻到地雷則當局結束。',
    ],
    tips: '地雷數越多、單次倍率越高，但風險也越大。',
  },
  {
    id: 'tower',
    hall: 'strategy',
    name: '疊塔',
    english: 'Tower X',
    cover: '/games/tower.jpg',
    rtp: '97%',
    maxMultiplier: '50,000×',
    duration: '可連續多局',
    intro: '一層一層往上爬，每層選一格安全位置就能繼續挑戰。',
    howToPlay: [
      '選擇難度（簡單／中等／困難／專家／大師）。',
      '每層在 2–3 格中選擇安全位置，避開陷阱即可上樓。',
      '隨時可領獎；踩到陷阱則當局結束。',
    ],
    tips: '專家與大師難度倍率成長極快，適合追求極限的玩家。',
  },
  {
    id: 'plinko',
    hall: 'strategy',
    name: '彈珠台',
    english: 'Plinko',
    cover: '/games/plinko.jpg',
    rtp: '99%',
    maxMultiplier: '1,000×',
    duration: '單局 3 秒',
    intro: '彈珠穿越釘陣自由落下，落入哪個倍率槽就拿那個倍率。',
    howToPlay: [
      '設定彈珠列數（8–16）與風險等級。',
      '點擊「掉落」釋放彈珠，系統即時播放下落動畫。',
      '彈珠落定後依倍率槽自動結算。',
    ],
    tips: '高風險模式邊緣槽倍率極高，但中央落點機率較低。',
  },
];

export function VerifyPage() {
  const [activeHall, setActiveHall] = useState<HallKey | 'all'>('all');

  const filteredGames = activeHall === 'all' ? GAMES : GAMES.filter((g) => g.hall === activeHall);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="relative overflow-hidden rounded-[28px] bg-[#0F172A] p-6 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)] md:p-8 xl:col-span-8 2xl:col-span-9">
          <img
            src="/backgrounds/game-guide-bg.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[72%_center]"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,15,28,0.96)_0%,rgba(7,15,28,0.9)_42%,rgba(7,15,28,0.52)_100%)]" />

          <div className="relative z-10">
            <div className="label !text-white/[0.55]">Game Guide</div>
            <div className="mt-4 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10">
                <BookOpen className="h-6 w-6 text-[#E8D48A]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-pretty text-[32px] font-bold leading-tight md:text-[40px]">
                  18 款人氣玩法，一頁讀懂規則與賠率。
                </h1>
                <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-white/[0.78]">
                  飛行、經典、策略三大主題館，從快節奏 Crash 到耐玩的策略對局，挑你今晚最想開的那一桌。每款遊戲都附上玩法步驟、RTP 與最高倍率，幫你快速上手。
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">RTP 96%–99%</span>
              <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">最高 1,000,000×</span>
              <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">即時派彩到帳</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to="/lobby"
                className="btn-chip border-white/15 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/[0.12]"
              >
                直接進入大廳
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <aside className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:col-span-4 2xl:col-span-3">
          <div className="label">Hall Filter</div>
          <h2 className="mt-3 text-[20px] font-bold text-[#0F172A]">挑一館深入看玩法</h2>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setActiveHall('all')}
              className={`flex w-full items-center justify-between rounded-full border px-4 py-2.5 text-[13px] font-semibold transition ${
                activeHall === 'all'
                  ? 'border-[#0F172A] bg-[#0F172A] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#0F172A]/40'
              }`}
            >
              <span>全部 18 款</span>
              <span className="text-[12px] opacity-70">{GAMES.length}</span>
            </button>
            {HALLS.map((hall) => {
              const count = GAMES.filter((g) => g.hall === hall.key).length;
              const active = activeHall === hall.key;
              return (
                <button
                  key={hall.key}
                  type="button"
                  onClick={() => setActiveHall(hall.key)}
                  className={`flex w-full items-center justify-between rounded-full border px-4 py-2.5 text-[13px] font-semibold transition ${
                    active
                      ? 'border-[#0F172A] bg-[#0F172A] text-white'
                      : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#0F172A]/40'
                  }`}
                >
                  <span>{hall.title}</span>
                  <span className="text-[12px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Game Catalogue"
          title={activeHall === 'all' ? '18 款遊戲完整玩法' : `${HALLS.find((h) => h.key === activeHall)?.title} 玩法詳解`}
          description="點開卡片看每款遊戲的下注步驟、賠率上限與操作要點。"
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGames.map((game) => {
            const hall = HALLS.find((h) => h.key === game.hall)!;
            return (
              <article
                key={game.id}
                className="relative flex flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#0B1322] text-white shadow-[0_16px_40px_rgba(2,6,23,0.45)]"
              >
                <img
                  src={game.cover}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.55]"
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(7,15,28,0.35) 0%, rgba(7,15,28,0.78) 38%, rgba(7,15,28,0.94) 70%, rgba(7,15,28,0.97) 100%)',
                  }}
                />

                <div className="relative z-10 flex flex-1 flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur"
                        style={{
                          backgroundColor: `${hall.tone}33`,
                          borderColor: `${hall.tone}80`,
                          color: '#FFE8B0',
                        }}
                      >
                        {hall.title}
                      </div>
                      <h3 className="mt-3 text-[24px] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                        {game.name}
                      </h3>
                      <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/55">
                        {game.english}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-[13px] leading-relaxed text-white/80">{game.intro}</p>

                  <dl className="mt-5 grid grid-cols-3 gap-2 rounded-[16px] border border-white/10 bg-white/[0.06] p-3 text-center backdrop-blur">
                    <Stat label="RTP" value={game.rtp} />
                    <Stat label="最高倍率" value={game.maxMultiplier} />
                    <Stat label="單局時長" value={game.duration} />
                  </dl>

                  <div className="mt-5">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E8D48A]">
                      玩法步驟
                    </div>
                    <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white/85">
                      {game.howToPlay.map((step, index) => (
                        <li key={index} className="flex gap-2">
                          <span className="font-semibold text-[#F3D67D]">{index + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="mt-5 rounded-[14px] border border-[#E8D48A]/35 bg-[#1F1A0E]/70 p-3 text-[12px] leading-relaxed text-[#F5DFA0] backdrop-blur">
                    <span className="font-semibold text-[#FFE8B0]">小提示：</span>
                    {game.tips}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-white">{value}</div>
    </div>
  );
}
