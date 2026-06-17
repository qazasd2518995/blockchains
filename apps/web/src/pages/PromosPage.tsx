import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Crown,
  Flame,
  Gift,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { MobilePageHeader } from '@/components/layout/MobilePageHeader';
import type { Locale } from '@/i18n/types';
import { useTranslation } from '@/i18n/useTranslation';

type PromoAccent = 'teal' | 'gold' | 'ember' | 'violet';
type PromoId = 'week' | 'vip' | 'jackpot' | 'friend';

interface PromoMetric {
  label: string;
  value: string;
  detail: string;
}

interface PromoCardText {
  id: PromoId;
  badge: string;
  title: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
}

interface PromoCard extends PromoCardText {
  image: string;
  accent: PromoAccent;
}

interface WeeklyWindow {
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  bg: string;
}

interface PromoRule {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface PromosCopy {
  mobileTitle: string;
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  currentFocusTitle: string;
  cardCount: (count: number) => string;
  rhythmTitle: string;
  desktopBadge: string;
  desktopHeroTitle: string;
  desktopHeroDescription: string;
  enterLobby: string;
  viewGuide: string;
  campaignEyebrow: string;
  campaignTitle: string;
  campaignDescription: string;
  weeklyEyebrow: string;
  weeklyTitle: string;
  weeklyDescription: string;
  focusEyebrow: string;
  focusTitle: string;
  focusDescription: string;
  focusTags: [string, string, string];
  hotGamesLabel: string;
  vipBoardLabel: string;
  vipBoardText: string;
  presentationLabel: string;
  presentationText: string;
  heroMetrics: PromoMetric[];
  cards: PromoCardText[];
  weeklyWindows: WeeklyWindow[];
  rules: PromoRule[];
}

const PROMO_CARD_MEDIA: Record<PromoId, { image: string; accent: PromoAccent }> = {
  week: { image: '/promos/weekly-multiplier-king.jpg', accent: 'teal' },
  vip: { image: '/banners/hero-welcome-dealer.png', accent: 'gold' },
  jackpot: { image: '/promos/crash-jackpot-pool.jpg', accent: 'ember' },
  friend: { image: '/games/hotline.jpg', accent: 'violet' },
};

const PROMOS_COPY: Record<Locale, PromosCopy> = {
  'zh-Hant': {
    mobileTitle: '優惠活動',
    heroBadge: '本週活動看板',
    heroTitle: '熱門優惠集中看',
    heroDescription: '倍率榜、Crash 彩池、VIP 等級與邀請活動，跟大廳同一套入口節奏。',
    currentFocusTitle: '當前活動重點',
    cardCount: (count) => `${count} 檔`,
    rhythmTitle: '活動節奏',
    desktopBadge: '活動優惠',
    desktopHeroTitle: '今晚先看哪一檔最熱，再決定你要把量跑去哪裡。',
    desktopHeroDescription:
      '把倍率榜、Crash 彩池、VIP 制度和推廣活動集中在同一頁。你不用到處翻入口，先看清楚本週檔期，再回大廳選最適合今晚節奏的玩法。',
    enterLobby: '直接進大廳',
    viewGuide: '查看遊戲說明',
    campaignEyebrow: 'Campaign Board',
    campaignTitle: '當前活動重點',
    campaignDescription:
      '用不同主題把獎勵結構拆開。想衝排名、看彩池、做等級、跑推廣，都能先從這一頁判斷。',
    weeklyEyebrow: 'Weekly Rhythm',
    weeklyTitle: '活動節奏',
    weeklyDescription: '把整週檔期拆成三個階段，玩家進入活動頁時就知道當前熱度集中在哪一段。',
    focusEyebrow: 'Focus Tonight',
    focusTitle: '倍率榜 + Crash 彩池',
    focusDescription:
      '想把活動頁做得更有壓迫感，重點不是塞更多字，而是讓玩家一眼看懂今晚哪一檔最值得進。',
    focusTags: ['排行熱度', '高倍爆點', '大廳導流'],
    hotGamesLabel: '熱點玩法',
    vipBoardLabel: '等級看板',
    vipBoardText: 'VIP 升級條件集中展示',
    presentationLabel: '活動呈現',
    presentationText: '主視覺、檔期、規則一頁收齊',
    heroMetrics: [
      { label: '本週焦點', value: '4 檔', detail: '熱門活動同時進行' },
      { label: '最高亮點', value: '100×', detail: 'Crash 爆池觸發門檻' },
      { label: '適用範圍', value: '全館', detail: '全館熱門玩法同步覆蓋' },
    ],
    cards: [
      {
        id: 'week',
        badge: '熱門檔期',
        title: '每週倍率王',
        summary: '週一至週日累計倍率排名，前 10 名共享獎勵池，越到週末競爭越熱。',
        stats: [
          { label: '統計週期', value: '週一 07:00 - 週日 06:59' },
          { label: '結算方式', value: '按最終排名派獎' },
          { label: '重點玩法', value: 'Crash / Dice / Plinko' },
        ],
      },
      {
        id: 'vip',
        badge: '等級制度',
        title: 'VIP 等級制度',
        summary: '依遊戲量自動升等，等級越高，專屬返水與活動檔期越完整，維持條件一頁看清。',
        stats: [
          { label: '升級依據', value: '近 30 日遊戲量' },
          { label: '權益內容', value: '返水 / 專屬檔期 / 身分識別' },
          { label: '適用館別', value: '經典 / Crash / 策略 / 牌桌' },
        ],
      },
      {
        id: 'jackpot',
        badge: '彩池加碼',
        title: 'Crash 彩池',
        summary: 'JetX3 全館累計，任意局觸發 100× 即爆池，彩池狀態會跟著大廳熱度持續推高。',
        stats: [
          { label: '觸發條件', value: '任意局達成 100×' },
          { label: '彩池來源', value: '全館即時累積' },
          { label: '推薦時段', value: '晚間高峰最熱' },
        ],
      },
      {
        id: 'friend',
        badge: '推廣活動',
        title: '邀請好友',
        summary: '好友遊戲量越穩定，回饋越高。適合已有固定玩家群的代理線一起衝活動強度。',
        stats: [
          { label: '計算方式', value: '依有效遊戲量回饋' },
          { label: '觀察區間', value: '每週更新一次' },
          { label: '適合對象', value: '穩定活躍代理線' },
        ],
      },
    ],
    weeklyWindows: [
      {
        title: '週一 - 週三',
        subtitle: '衝量預熱',
        description: '適合先把大廳熱度拉起來，累積倍率榜與 VIP 升級量。',
        accent: 'text-[#EA580C]',
        bg: 'bg-[#FFF7ED]',
      },
      {
        title: '週四 - 週五',
        subtitle: '彩池加溫',
        description: 'Crash 彩池與策略館活動開始升溫，適合集中做高倍衝刺。',
        accent: 'text-[#B94538]',
        bg: 'bg-[#FBEDEA]',
      },
      {
        title: '週末檔期',
        subtitle: '全館高峰',
        description: '倍率榜結算前競爭最激烈，活動曝光與戰報熱度都會明顯拉高。',
        accent: 'text-[#AE8B35]',
        bg: 'bg-[#FBF4DE]',
      },
    ],
    rules: [
      {
        icon: ShieldCheck,
        title: '活動以遊戲日計算',
        description: '所有統計統一按台北時間早上 07:00 切日，避免結算時間認知不一致。',
      },
      {
        icon: Clock3,
        title: '檔期同步更新',
        description: '大廳與活動頁會同步展示目前檔期，熱門活動切換後不需要重新找入口。',
      },
      {
        icon: Sparkles,
        title: '視覺焦點集中',
        description: '熱門活動、彩池和 VIP 制度分開陳列，方便玩家快速判斷今晚重點。',
      },
    ],
  },
  'zh-Hans': {
    mobileTitle: '优惠活动',
    heroBadge: '本周活动看板',
    heroTitle: '热门优惠集中看',
    heroDescription: '倍率榜、Crash 彩池、VIP 等级与邀请活动，跟大厅同一套入口节奏。',
    currentFocusTitle: '当前活动重点',
    cardCount: (count) => `${count} 档`,
    rhythmTitle: '活动节奏',
    desktopBadge: '活动优惠',
    desktopHeroTitle: '今晚先看哪一档最热，再决定你要把量跑去哪里。',
    desktopHeroDescription:
      '把倍率榜、Crash 彩池、VIP 制度和推广活动集中在同一页。你不用到处翻入口，先看清楚本周档期，再回大厅选最适合今晚节奏的玩法。',
    enterLobby: '直接进大厅',
    viewGuide: '查看游戏说明',
    campaignEyebrow: 'Campaign Board',
    campaignTitle: '当前活动重点',
    campaignDescription:
      '用不同主题把奖励结构拆开。想冲排名、看彩池、做等级、跑推广，都能先从这一页判断。',
    weeklyEyebrow: 'Weekly Rhythm',
    weeklyTitle: '活动节奏',
    weeklyDescription: '把整周档期拆成三个阶段，玩家进入活动页时就知道当前热度集中在哪一段。',
    focusEyebrow: 'Focus Tonight',
    focusTitle: '倍率榜 + Crash 彩池',
    focusDescription: '重点不是塞更多字，而是让玩家一眼看懂今晚哪一档最值得进。',
    focusTags: ['排行热度', '高倍爆点', '大厅导流'],
    hotGamesLabel: '热点玩法',
    vipBoardLabel: '等级看板',
    vipBoardText: 'VIP 升级条件集中展示',
    presentationLabel: '活动呈现',
    presentationText: '主视觉、档期、规则一页收齐',
    heroMetrics: [
      { label: '本周焦点', value: '4 档', detail: '热门活动同时进行' },
      { label: '最高亮点', value: '100×', detail: 'Crash 爆池触发门槛' },
      { label: '适用范围', value: '全馆', detail: '全馆热门玩法同步覆盖' },
    ],
    cards: [
      {
        id: 'week',
        badge: '热门档期',
        title: '每周倍率王',
        summary: '周一至周日累计倍率排名，前 10 名共享奖励池，越到周末竞争越热。',
        stats: [
          { label: '统计周期', value: '周一 07:00 - 周日 06:59' },
          { label: '结算方式', value: '按最终排名派奖' },
          { label: '重点玩法', value: 'Crash / Dice / Plinko' },
        ],
      },
      {
        id: 'vip',
        badge: '等级制度',
        title: 'VIP 等级制度',
        summary: '依游戏量自动升等，等级越高，专属返水与活动档期越完整，维持条件一页看清。',
        stats: [
          { label: '升级依据', value: '近 30 日游戏量' },
          { label: '权益内容', value: '返水 / 专属档期 / 身分识别' },
          { label: '适用馆别', value: '经典 / Crash / 策略 / 牌桌' },
        ],
      },
      {
        id: 'jackpot',
        badge: '彩池加码',
        title: 'Crash 彩池',
        summary: 'JetX3 全馆累计，任意局触发 100× 即爆池，彩池状态会跟着大厅热度持续推高。',
        stats: [
          { label: '触发条件', value: '任意局达成 100×' },
          { label: '彩池来源', value: '全馆实时累积' },
          { label: '推荐时段', value: '晚间高峰最热' },
        ],
      },
      {
        id: 'friend',
        badge: '推广活动',
        title: '邀请好友',
        summary: '好友游戏量越稳定，回馈越高。适合已有固定玩家群的代理线一起冲活动强度。',
        stats: [
          { label: '计算方式', value: '依有效游戏量回馈' },
          { label: '观察区间', value: '每周更新一次' },
          { label: '适合对象', value: '稳定活跃代理线' },
        ],
      },
    ],
    weeklyWindows: [
      {
        title: '周一 - 周三',
        subtitle: '冲量预热',
        description: '适合先把大厅热度拉起来，累积倍率榜与 VIP 升级量。',
        accent: 'text-[#EA580C]',
        bg: 'bg-[#FFF7ED]',
      },
      {
        title: '周四 - 周五',
        subtitle: '彩池加温',
        description: 'Crash 彩池与策略馆活动开始升温，适合集中做高倍冲刺。',
        accent: 'text-[#B94538]',
        bg: 'bg-[#FBEDEA]',
      },
      {
        title: '周末档期',
        subtitle: '全馆高峰',
        description: '倍率榜结算前竞争最激烈，活动曝光与战报热度都会明显拉高。',
        accent: 'text-[#AE8B35]',
        bg: 'bg-[#FBF4DE]',
      },
    ],
    rules: [
      {
        icon: ShieldCheck,
        title: '活动以游戏日计算',
        description: '所有统计统一按台北时间早上 07:00 切日，避免结算时间认知不一致。',
      },
      {
        icon: Clock3,
        title: '档期同步更新',
        description: '大厅与活动页会同步展示目前档期，热门活动切换后不需要重新找入口。',
      },
      {
        icon: Sparkles,
        title: '视觉焦点集中',
        description: '热门活动、彩池和 VIP 制度分开陈列，方便玩家快速判断今晚重点。',
      },
    ],
  },
  en: {
    mobileTitle: 'Promotions',
    heroBadge: 'Weekly Campaign Board',
    heroTitle: 'Current promos at a glance',
    heroDescription:
      'Multiplier rankings, Crash jackpot pool, VIP levels and invite campaigns follow the same rhythm as the lobby.',
    currentFocusTitle: 'Current Highlights',
    cardCount: (count) => `${count} campaigns`,
    rhythmTitle: 'Campaign Rhythm',
    desktopBadge: 'Promotions',
    desktopHeroTitle: 'Check what is hottest tonight, then choose where to play.',
    desktopHeroDescription:
      'Multiplier rankings, Crash pools, VIP progress and invite campaigns are gathered on one page so players can review the week and return to the lobby with a clear target.',
    enterLobby: 'Enter Lobby',
    viewGuide: 'View Game Guide',
    campaignEyebrow: 'Campaign Board',
    campaignTitle: 'Current Highlights',
    campaignDescription:
      'Rewards are separated by theme, making it easy to compare ranking pushes, jackpot pools, VIP progress and invite activity.',
    weeklyEyebrow: 'Weekly Rhythm',
    weeklyTitle: 'Campaign Rhythm',
    weeklyDescription:
      'The week is split into three stages so players can see where the current attention is focused.',
    focusEyebrow: 'Focus Tonight',
    focusTitle: 'Multiplier Ranking + Crash Pool',
    focusDescription:
      'The page keeps the main target clear: which event is worth entering tonight and why.',
    focusTags: ['Ranking Heat', 'High-Multiplier Trigger', 'Lobby Flow'],
    hotGamesLabel: 'Hot Games',
    vipBoardLabel: 'VIP Board',
    vipBoardText: 'VIP upgrade conditions shown together',
    presentationLabel: 'Campaign Layout',
    presentationText: 'Hero, schedule and rules in one page',
    heroMetrics: [
      { label: 'Weekly Focus', value: '4', detail: 'Active campaigns running together' },
      { label: 'Top Trigger', value: '100×', detail: 'Crash pool trigger point' },
      { label: 'Coverage', value: 'All', detail: 'Popular games covered across halls' },
    ],
    cards: [
      {
        id: 'week',
        badge: 'Hot Window',
        title: 'Weekly Multiplier King',
        summary:
          'Rank by accumulated multipliers from Monday to Sunday. The top 10 share the reward pool, and competition heats up near the weekend.',
        stats: [
          { label: 'Period', value: 'Mon 07:00 - Sun 06:59' },
          { label: 'Settlement', value: 'Paid by final ranking' },
          { label: 'Focus Games', value: 'Crash / Dice / Plinko' },
        ],
      },
      {
        id: 'vip',
        badge: 'Level Program',
        title: 'VIP Level Program',
        summary:
          'Level up automatically by play volume. Higher levels unlock clearer rebates, campaign access and status benefits.',
        stats: [
          { label: 'Upgrade Basis', value: 'Last 30 days play volume' },
          { label: 'Benefits', value: 'Rebate / campaigns / status' },
          { label: 'Halls', value: 'Instant / Crash / Strategy / Tables' },
        ],
      },
      {
        id: 'jackpot',
        badge: 'Pool Boost',
        title: 'Crash Jackpot Pool',
        summary:
          'JetX3 pool accumulates across the hall. Any round reaching 100× can trigger the pool as lobby heat builds.',
        stats: [
          { label: 'Trigger', value: 'Any round reaches 100×' },
          { label: 'Pool Source', value: 'Real-time hall accumulation' },
          { label: 'Best Time', value: 'Evening peak' },
        ],
      },
      {
        id: 'friend',
        badge: 'Invite Event',
        title: 'Invite Friends',
        summary:
          'The steadier your invited friends play, the higher the return. Useful for groups with active player traffic.',
        stats: [
          { label: 'Calculation', value: 'By valid play volume' },
          { label: 'Window', value: 'Updated weekly' },
          { label: 'Best For', value: 'Stable active groups' },
        ],
      },
    ],
    weeklyWindows: [
      {
        title: 'Mon - Wed',
        subtitle: 'Volume Warm-Up',
        description: 'Build lobby activity early and accumulate multiplier ranking and VIP progress.',
        accent: 'text-[#EA580C]',
        bg: 'bg-[#FFF7ED]',
      },
      {
        title: 'Thu - Fri',
        subtitle: 'Pool Heating',
        description: 'Crash pool and strategy campaigns heat up, making high-multiplier pushes more visible.',
        accent: 'text-[#B94538]',
        bg: 'bg-[#FBEDEA]',
      },
      {
        title: 'Weekend',
        subtitle: 'Hall Peak',
        description: 'Competition is strongest before ranking settlement and battle reports gain more attention.',
        accent: 'text-[#AE8B35]',
        bg: 'bg-[#FBF4DE]',
      },
    ],
    rules: [
      {
        icon: ShieldCheck,
        title: 'Campaigns use the game day',
        description: 'All campaign stats roll over at 07:00 Taipei time for consistent settlement.',
      },
      {
        icon: Clock3,
        title: 'Windows update together',
        description: 'The lobby and promotions page show the same current campaign window.',
      },
      {
        icon: Sparkles,
        title: 'Focus stays separated',
        description: 'Hot campaigns, pools and VIP progress are shown separately so players can compare quickly.',
      },
    ],
  },
  th: {
    mobileTitle: 'โปรโมชัน',
    heroBadge: 'กระดานกิจกรรมสัปดาห์นี้',
    heroTitle: 'ดูโปรโมชันเด่นได้ในหน้าเดียว',
    heroDescription:
      'อันดับตัวคูณ, แจ็กพอต Crash, ระดับ VIP และกิจกรรมชวนเพื่อนใช้จังหวะเดียวกับล็อบบี้',
    currentFocusTitle: 'ไฮไลต์ปัจจุบัน',
    cardCount: (count) => `${count} แคมเปญ`,
    rhythmTitle: 'จังหวะกิจกรรม',
    desktopBadge: 'โปรโมชัน',
    desktopHeroTitle: 'ดูว่าคืนนี้กิจกรรมไหนร้อนแรง แล้วค่อยเลือกเกมที่จะลงเล่น',
    desktopHeroDescription:
      'รวมอันดับตัวคูณ, Crash Pool, ระบบ VIP และกิจกรรมชวนเพื่อนไว้ในหน้าเดียว ผู้เล่นจึงเห็นรอบกิจกรรมของสัปดาห์ก่อนกลับไปเลือกเกมในล็อบบี้',
    enterLobby: 'เข้าล็อบบี้',
    viewGuide: 'ดูคู่มือเกม',
    campaignEyebrow: 'Campaign Board',
    campaignTitle: 'ไฮไลต์ปัจจุบัน',
    campaignDescription:
      'แยกรางวัลตามธีมให้เปรียบเทียบได้ง่าย ทั้งอันดับ แจ็กพอต ระดับ VIP และกิจกรรมชวนเพื่อน',
    weeklyEyebrow: 'Weekly Rhythm',
    weeklyTitle: 'จังหวะกิจกรรม',
    weeklyDescription: 'แบ่งสัปดาห์เป็นสามช่วง เพื่อให้เห็นว่าตอนนี้ความสนใจไปอยู่ที่ช่วงไหน',
    focusEyebrow: 'Focus Tonight',
    focusTitle: 'อันดับตัวคูณ + Crash Pool',
    focusDescription: 'หน้านี้ทำให้เป้าหมายหลักชัดเจน ว่าคืนนี้กิจกรรมไหนควรเข้าและเพราะอะไร',
    focusTags: ['ความร้อนอันดับ', 'จุดตัวคูณสูง', 'พาเข้าล็อบบี้'],
    hotGamesLabel: 'เกมเด่น',
    vipBoardLabel: 'กระดาน VIP',
    vipBoardText: 'แสดงเงื่อนไขอัปเกรด VIP รวมกัน',
    presentationLabel: 'การแสดงกิจกรรม',
    presentationText: 'ภาพหลัก รอบเวลา และกติกาอยู่ในหน้าเดียว',
    heroMetrics: [
      { label: 'โฟกัสสัปดาห์นี้', value: '4', detail: 'แคมเปญยอดนิยมกำลังเดินพร้อมกัน' },
      { label: 'ทริกเกอร์สูงสุด', value: '100×', detail: 'จุดทริกเกอร์ Crash Pool' },
      { label: 'ขอบเขต', value: 'ทั้งหมด', detail: 'ครอบคลุมเกมยอดนิยมทุกห้อง' },
    ],
    cards: [
      {
        id: 'week',
        badge: 'ช่วงฮอต',
        title: 'ราชาตัวคูณประจำสัปดาห์',
        summary:
          'จัดอันดับตัวคูณสะสมตั้งแต่วันจันทร์ถึงวันอาทิตย์ ผู้เล่น 10 อันดับแรกแบ่งรางวัล และการแข่งขันจะร้อนขึ้นช่วงสุดสัปดาห์',
        stats: [
          { label: 'รอบนับคะแนน', value: 'จันทร์ 07:00 - อาทิตย์ 06:59' },
          { label: 'การจ่ายรางวัล', value: 'จ่ายตามอันดับสุดท้าย' },
          { label: 'เกมหลัก', value: 'Crash / Dice / Plinko' },
        ],
      },
      {
        id: 'vip',
        badge: 'ระบบระดับ',
        title: 'ระบบระดับ VIP',
        summary:
          'อัปเลเวลอัตโนมัติตามปริมาณเล่น ระดับสูงขึ้นจะเห็นรีเบต สิทธิ์กิจกรรม และสถานะได้ชัดเจนขึ้น',
        stats: [
          { label: 'เกณฑ์อัปเกรด', value: 'ปริมาณเล่น 30 วันที่ผ่านมา' },
          { label: 'สิทธิ์', value: 'รีเบต / กิจกรรม / สถานะ' },
          { label: 'ห้องที่ใช้', value: 'ทันใจ / Crash / กลยุทธ์ / โต๊ะ' },
        ],
      },
      {
        id: 'jackpot',
        badge: 'เพิ่มพูล',
        title: 'Crash Jackpot Pool',
        summary:
          'JetX3 สะสมพูลทั้งห้อง รอบใดแตะ 100× ก็มีโอกาสทริกเกอร์พูล และมูลค่าจะเพิ่มตามความร้อนของล็อบบี้',
        stats: [
          { label: 'เงื่อนไขทริกเกอร์', value: 'รอบใดก็ได้ถึง 100×' },
          { label: 'ที่มาของพูล', value: 'สะสมแบบเรียลไทม์ทั้งห้อง' },
          { label: 'ช่วงแนะนำ', value: 'พีคช่วงค่ำ' },
        ],
      },
      {
        id: 'friend',
        badge: 'กิจกรรมชวนเพื่อน',
        title: 'ชวนเพื่อน',
        summary:
          'ยิ่งเพื่อนที่ชวนมาเล่นสม่ำเสมอ ผลตอบแทนยิ่งสูง เหมาะกับกลุ่มที่มีผู้เล่นใช้งานต่อเนื่อง',
        stats: [
          { label: 'วิธีคำนวณ', value: 'ตามปริมาณเล่นที่เข้าเกณฑ์' },
          { label: 'ช่วงติดตาม', value: 'อัปเดตทุกสัปดาห์' },
          { label: 'เหมาะกับ', value: 'กลุ่มผู้เล่นที่แอคทีฟสม่ำเสมอ' },
        ],
      },
    ],
    weeklyWindows: [
      {
        title: 'จันทร์ - พุธ',
        subtitle: 'วอร์มอัปปริมาณเล่น',
        description: 'เหมาะกับการดึงความร้อนล็อบบี้ตั้งแต่ต้น และสะสมอันดับตัวคูณกับ VIP',
        accent: 'text-[#EA580C]',
        bg: 'bg-[#FFF7ED]',
      },
      {
        title: 'พฤหัส - ศุกร์',
        subtitle: 'Pool เริ่มร้อน',
        description: 'Crash Pool และกิจกรรมห้องกลยุทธ์เริ่มเด่น เหมาะกับการไล่ตัวคูณสูง',
        accent: 'text-[#B94538]',
        bg: 'bg-[#FBEDEA]',
      },
      {
        title: 'สุดสัปดาห์',
        subtitle: 'พีคทั้งห้อง',
        description: 'การแข่งขันก่อนสรุปอันดับจะเข้มที่สุด และรายงานชนะจะได้รับความสนใจมากขึ้น',
        accent: 'text-[#AE8B35]',
        bg: 'bg-[#FBF4DE]',
      },
    ],
    rules: [
      {
        icon: ShieldCheck,
        title: 'กิจกรรมคิดตามวันเกม',
        description: 'สถิติทั้งหมดตัดรอบเวลา 07:00 ตามเวลาไทเป เพื่อให้การสรุปผลตรงกัน',
      },
      {
        icon: Clock3,
        title: 'รอบกิจกรรมอัปเดตพร้อมกัน',
        description: 'ล็อบบี้และหน้าโปรโมชันจะแสดงรอบกิจกรรมปัจจุบันตรงกัน',
      },
      {
        icon: Sparkles,
        title: 'แยกจุดโฟกัสชัดเจน',
        description: 'กิจกรรมฮอต Pool และระดับ VIP ถูกแยกแสดง เพื่อให้ผู้เล่นเปรียบเทียบได้เร็ว',
      },
    ],
  },
  vi: {
    mobileTitle: 'Khuyến mãi',
    heroBadge: 'Bảng sự kiện tuần',
    heroTitle: 'Xem nhanh các ưu đãi nổi bật',
    heroDescription:
      'Bảng xếp hạng hệ số, quỹ Crash, cấp VIP và sự kiện mời bạn bè dùng cùng nhịp vào sảnh.',
    currentFocusTitle: 'Điểm nổi bật hiện tại',
    cardCount: (count) => `${count} mục`,
    rhythmTitle: 'Nhịp sự kiện',
    desktopBadge: 'Khuyến mãi',
    desktopHeroTitle: 'Xem sự kiện nào nóng nhất tối nay, rồi chọn nơi để chơi.',
    desktopHeroDescription:
      'Bảng xếp hạng hệ số, Crash Pool, tiến độ VIP và mời bạn bè được gom vào một trang để người chơi nắm lịch tuần trước khi quay lại sảnh.',
    enterLobby: 'Vào sảnh',
    viewGuide: 'Xem hướng dẫn game',
    campaignEyebrow: 'Campaign Board',
    campaignTitle: 'Điểm nổi bật hiện tại',
    campaignDescription:
      'Cấu trúc thưởng được chia theo chủ đề để dễ so sánh xếp hạng, quỹ jackpot, VIP và hoạt động mời bạn bè.',
    weeklyEyebrow: 'Weekly Rhythm',
    weeklyTitle: 'Nhịp sự kiện',
    weeklyDescription: 'Tuần được chia thành ba giai đoạn để người chơi biết trọng tâm hiện tại nằm ở đâu.',
    focusEyebrow: 'Focus Tonight',
    focusTitle: 'Xếp hạng hệ số + Crash Pool',
    focusDescription: 'Trang này giữ mục tiêu rõ ràng: tối nay nên vào sự kiện nào và lý do vì sao.',
    focusTags: ['Độ nóng xếp hạng', 'Mốc hệ số cao', 'Dẫn về sảnh'],
    hotGamesLabel: 'Game nóng',
    vipBoardLabel: 'Bảng VIP',
    vipBoardText: 'Điều kiện nâng VIP hiển thị cùng một nơi',
    presentationLabel: 'Cách trình bày',
    presentationText: 'Hình chính, lịch và luật trong một trang',
    heroMetrics: [
      { label: 'Trọng tâm tuần', value: '4', detail: 'Các chiến dịch nổi bật đang chạy cùng lúc' },
      { label: 'Mốc cao nhất', value: '100×', detail: 'Mốc kích hoạt Crash Pool' },
      { label: 'Phạm vi', value: 'Toàn sảnh', detail: 'Bao phủ các game phổ biến trong mọi phòng' },
    ],
    cards: [
      {
        id: 'week',
        badge: 'Khung giờ nóng',
        title: 'Vua hệ số tuần',
        summary:
          'Xếp hạng theo hệ số tích lũy từ thứ Hai đến Chủ nhật. Top 10 chia quỹ thưởng, càng gần cuối tuần càng cạnh tranh.',
        stats: [
          { label: 'Chu kỳ', value: 'Thứ Hai 07:00 - Chủ nhật 06:59' },
          { label: 'Kết toán', value: 'Trả theo thứ hạng cuối' },
          { label: 'Game trọng tâm', value: 'Crash / Dice / Plinko' },
        ],
      },
      {
        id: 'vip',
        badge: 'Hệ thống cấp',
        title: 'Hệ thống cấp VIP',
        summary:
          'Tự nâng cấp theo lượng chơi. Cấp càng cao, hoàn trả, sự kiện riêng và quyền lợi trạng thái càng rõ.',
        stats: [
          { label: 'Căn cứ nâng cấp', value: 'Lượng chơi 30 ngày gần nhất' },
          { label: 'Quyền lợi', value: 'Hoàn trả / sự kiện / trạng thái' },
          { label: 'Phòng áp dụng', value: 'Tức thì / Crash / Chiến thuật / Bàn' },
        ],
      },
      {
        id: 'jackpot',
        badge: 'Tăng quỹ',
        title: 'Crash Jackpot Pool',
        summary:
          'JetX3 tích lũy toàn phòng. Bất kỳ ván nào đạt 100× đều có thể kích hoạt quỹ khi sảnh đang nóng.',
        stats: [
          { label: 'Điều kiện', value: 'Bất kỳ ván nào đạt 100×' },
          { label: 'Nguồn quỹ', value: 'Tích lũy thời gian thực toàn phòng' },
          { label: 'Khung đề xuất', value: 'Giờ cao điểm buổi tối' },
        ],
      },
      {
        id: 'friend',
        badge: 'Mời bạn bè',
        title: 'Mời bạn bè',
        summary:
          'Bạn bè chơi càng đều, mức hoàn càng cao. Phù hợp với nhóm đã có người chơi hoạt động ổn định.',
        stats: [
          { label: 'Cách tính', value: 'Theo lượng chơi hợp lệ' },
          { label: 'Khoảng theo dõi', value: 'Cập nhật mỗi tuần' },
          { label: 'Phù hợp', value: 'Nhóm hoạt động ổn định' },
        ],
      },
    ],
    weeklyWindows: [
      {
        title: 'Thứ Hai - Thứ Tư',
        subtitle: 'Làm nóng lượng chơi',
        description: 'Phù hợp để kéo độ nóng sảnh sớm và tích lũy xếp hạng hệ số cùng tiến độ VIP.',
        accent: 'text-[#EA580C]',
        bg: 'bg-[#FFF7ED]',
      },
      {
        title: 'Thứ Năm - Thứ Sáu',
        subtitle: 'Quỹ bắt đầu nóng',
        description: 'Crash Pool và sự kiện phòng chiến thuật nổi bật hơn, phù hợp để đẩy hệ số cao.',
        accent: 'text-[#B94538]',
        bg: 'bg-[#FBEDEA]',
      },
      {
        title: 'Cuối tuần',
        subtitle: 'Cao điểm toàn sảnh',
        description: 'Cạnh tranh mạnh nhất trước khi chốt hạng, các chiến báo cũng được chú ý hơn.',
        accent: 'text-[#AE8B35]',
        bg: 'bg-[#FBF4DE]',
      },
    ],
    rules: [
      {
        icon: ShieldCheck,
        title: 'Sự kiện tính theo ngày game',
        description: 'Mọi thống kê chốt ngày lúc 07:00 theo giờ Đài Bắc để kết toán nhất quán.',
      },
      {
        icon: Clock3,
        title: 'Lịch sự kiện cập nhật đồng bộ',
        description: 'Sảnh và trang khuyến mãi hiển thị cùng khung sự kiện hiện tại.',
      },
      {
        icon: Sparkles,
        title: 'Trọng tâm được tách rõ',
        description: 'Sự kiện nóng, quỹ và tiến độ VIP được tách riêng để người chơi so sánh nhanh.',
      },
    ],
  },
};

function getPromoCards(copy: PromosCopy): PromoCard[] {
  return copy.cards.map((card) => ({ ...card, ...PROMO_CARD_MEDIA[card.id] }));
}

export function PromosPage() {
  const { locale } = useTranslation();
  const copy = PROMOS_COPY[locale];
  const promoCards = getPromoCards(copy);

  return (
    <>
      <div className="min-h-[100svh] bg-[#EDF4F7] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
        <MobilePageHeader title={copy.mobileTitle} subtitle="PROMOTIONS" active="promos" />

        <section className="border-b border-[#D1E0E7] bg-white">
          <div className="relative min-h-[132px] overflow-hidden bg-[#1B2030]">
            <img
              src="/banners/hero-crash-dealer.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-[0.82]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.92)_0%,rgba(5,18,34,0.72)_47%,rgba(5,18,34,0.12)_100%)]" />
            <div className="relative z-10 flex min-h-[132px] flex-col justify-center px-4 py-3">
              <span className="inline-flex w-fit items-center gap-1 rounded-[8px] bg-[#F7D568] px-2 py-1 text-[10px] font-black text-[#4B3600] shadow-sm">
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.heroBadge}
              </span>
              <h1 className="mt-2 max-w-[250px] text-[26px] font-black leading-tight text-white">
                {copy.heroTitle}
              </h1>
              <p className="mt-1 max-w-[270px] text-[12px] font-semibold leading-5 text-white/78">
                {copy.heroDescription}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2 px-2 py-2">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#FED7AA] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#F97316]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">
                {copy.currentFocusTitle}
              </span>
            </div>
            <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-bold text-[#15803D]">
              {copy.cardCount(promoCards.length)}
            </span>
          </div>

          <div className="grid gap-2">
            {promoCards.map((promo) => (
              <article
                key={promo.id}
                className="overflow-hidden rounded-[13px] border border-[#FED7AA] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)]"
              >
                <div className="relative min-h-[112px] overflow-hidden">
                  <img
                    src={promo.image}
                    alt={promo.title}
                    className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.88]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_50%,rgba(255,255,255,0.2)_100%)]" />
                  <div className="relative z-10 flex min-h-[112px] flex-col justify-between p-3">
                    <div>
                      <span className="inline-flex rounded-[8px] bg-[#FFF7ED] px-2 py-1 text-[10px] font-black text-[#C2410C]">
                        {promo.badge}
                      </span>
                      <h2 className="mt-2 text-[20px] font-black leading-tight text-[#12333E]">
                        {promo.title}
                      </h2>
                    </div>
                    <p className="max-w-[260px] text-[12px] font-semibold leading-5 text-[#315967]">
                      {promo.summary}
                    </p>
                  </div>
                </div>

                <div className="grid gap-1.5 border-t border-[#FED7AA]/60 bg-[#FFF7ED] p-2">
                  {promo.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-start justify-between gap-3 rounded-[9px] bg-white px-2.5 py-2"
                    >
                      <span className="shrink-0 text-[11px] font-black text-[#9A3412]">
                        {stat.label}
                      </span>
                      <span className="min-w-0 text-right text-[12px] font-bold leading-5 text-[#12333E]">
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-2 px-2 pb-3">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#FED7AA] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#F7B733]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">
                {copy.rhythmTitle}
              </span>
            </div>
            <CalendarDays className="h-4 w-4 text-[#9A3412]" aria-hidden="true" />
          </div>
          <div className="grid gap-2">
            {copy.weeklyWindows.map((item) => (
              <article
                key={item.title}
                className="rounded-[13px] border border-[#FED7AA] bg-white p-3 shadow-[0_6px_14px_rgba(15,23,42,0.07)]"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A8B97]">
                  {item.title}
                </div>
                <h3 className="mt-1 text-[17px] font-black text-[#12333E]">{item.subtitle}</h3>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-[#516976]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="hidden space-y-10 pb-6 lg:block">
        <section className="relative overflow-hidden rounded-[28px] border border-[#162238] bg-[#0D1728] shadow-[0_24px_60px_rgba(2,6,23,0.28)]">
          <img
            src="/banners/hero-crash-dealer.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[center_28%] opacity-30"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,15,27,0.92)_0%,rgba(10,20,34,0.84)_42%,rgba(14,69,85,0.28)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,212,138,0.16),transparent_32%)]" />

          <div className="relative grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:px-8 lg:py-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="tag tag-goldOnDark">
                  <Gift className="h-4 w-4" aria-hidden="true" />
                  {copy.desktopBadge}
                </span>
                <span className="tag tag-onDark">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {copy.heroBadge}
                </span>
              </div>

              <h1 className="mt-5 max-w-3xl text-balance text-[34px] font-bold leading-[1.04] text-white md:text-[46px]">
                {copy.desktopHeroTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-8 text-white/74">
                {copy.desktopHeroDescription}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/lobby" className="btn-teal text-[13px]">
                  {copy.enterLobby}
                </Link>
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white/88 transition hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
                >
                  {copy.viewGuide}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {copy.heroMetrics.map((item) => (
                <article
                  key={item.label}
                  className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.04)_100%)] px-4 py-4 backdrop-blur"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/52">
                    {item.label}
                  </div>
                  <div className="mt-3 data-num text-[30px] font-black text-[#E8D48A]">
                    {item.value}
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-white/72">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeading
            eyebrow={copy.campaignEyebrow}
            title={copy.campaignTitle}
            description={copy.campaignDescription}
          />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {promoCards.map((promo) => (
              <article
                key={promo.id}
                className="overflow-hidden rounded-[22px] border border-[#DCE3EA] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.12)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={promo.image} alt={promo.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,15,28,0.08)_0%,rgba(10,15,28,0.72)_100%)]" />
                  <div className="absolute left-4 top-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-white ${
                        promo.accent === 'teal'
                          ? 'bg-[#EA580C]'
                          : promo.accent === 'ember'
                            ? 'bg-[#B94538]'
                            : promo.accent === 'gold'
                              ? 'bg-[#AE8B35]'
                              : 'bg-[#6E56CF]'
                      }`}
                    >
                      {promo.badge}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-[24px] font-bold text-white">{promo.title}</h3>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <p className="text-[13px] leading-7 text-[#4A5568]">{promo.summary}</p>

                  <div className="space-y-2">
                    {promo.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="flex items-start justify-between gap-3 border-b border-[#EEF2F6] pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
                          {stat.label}
                        </span>
                        <span className="text-right text-[12px] font-semibold text-[#0F172A]">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeading
            eyebrow={copy.weeklyEyebrow}
            title={copy.weeklyTitle}
            description={copy.weeklyDescription}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 md:grid-cols-3">
              {copy.weeklyWindows.map((item) => (
                <article
                  key={item.title}
                  className={`rounded-[20px] border border-[#E5E7EB] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${item.bg}`}
                >
                  <div className="label">{item.title}</div>
                  <h3 className={`mt-3 text-[22px] font-bold ${item.accent}`}>{item.subtitle}</h3>
                  <p className="mt-3 text-[13px] leading-7 text-[#4A5568]">{item.description}</p>
                </article>
              ))}
            </div>

            <div className="rounded-[22px] border border-[#D8C081] bg-[linear-gradient(135deg,#F9E7A8_0%,#E8D48A_100%)] px-5 py-5 text-[#5A471A] shadow-[0_18px_40px_rgba(174,139,53,0.18)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A5E1C]">
                    {copy.focusEyebrow}
                  </div>
                  <div className="mt-1 text-[24px] font-black">{copy.focusTitle}</div>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-7 text-[#6A5320]">
                {copy.focusDescription}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="tag tag-gold">{copy.focusTags[0]}</span>
                <span className="tag tag-wine">{copy.focusTags[1]}</span>
                <span className="tag tag-acid">{copy.focusTags[2]}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {copy.rules.map((rule) => {
              const Icon = rule.icon;
              return (
                <article
                  key={rule.title}
                  className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-[#EA580C]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-bold text-[#0F172A]">{rule.title}</h3>
                      <p className="mt-2 text-[13px] leading-7 text-[#4A5568]">
                        {rule.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF7ED] text-[#EA580C]">
                  <Flame className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="label">{copy.hotGamesLabel}</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">
                    Crash / Plinko / Dice
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBF4DE] text-[#AE8B35]">
                  <Crown className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="label">{copy.vipBoardLabel}</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">{copy.vipBoardText}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBEDEA] text-[#B94538]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="label">{copy.presentationLabel}</div>
                  <div className="mt-1 text-[18px] font-bold text-[#0F172A]">{copy.presentationText}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
