import type { HallId, HallMeta } from '@/data/halls';
import type { Locale } from './types';

interface HallLabel {
  name: string;
  tagline: string;
  short: string;
}

const HALL_LABELS: Record<Locale, Record<HallId, HallLabel>> = {
  'zh-Hant': {
    crash: { name: 'Crash 飛行館', short: '飛行', tagline: '倍速起飛，看準時機一鍵收分' },
    tables: { name: '棋牌牌桌館', short: '牌桌', tagline: '拚手牌、算點數，專注每一局牌桌節奏' },
    slots: {
      name: '拉霸老虎機館',
      short: '拉霸',
      tagline: '多款主題老虎機，轉軸、連線、爆分節奏集中開',
    },
    roulette: {
      name: '輪盤轉輪館',
      short: '輪盤',
      tagline: '指針、輪盤、轉輪一次排開，押區押色都直覺',
    },
    classic: {
      name: '即開電子館',
      short: '即開',
      tagline: '骰子、基諾、彈珠這類短局即開玩法集中在這裡',
    },
    strategy: {
      name: '策略挑戰館',
      short: '策略',
      tagline: '逐步選擇、隨時收手，靠判斷把倍率一路推高',
    },
  },
  'zh-Hans': {
    crash: { name: 'Crash 飞行馆', short: '飞行', tagline: '倍速起飞，看准时机一键收分' },
    tables: { name: '棋牌牌桌馆', short: '牌桌', tagline: '拼手牌、算点数，专注每一局牌桌节奏' },
    slots: {
      name: '拉霸老虎机馆',
      short: '拉霸',
      tagline: '多款主题老虎机，转轴、连线、爆分节奏集中开',
    },
    roulette: {
      name: '轮盘转轮馆',
      short: '轮盘',
      tagline: '指针、轮盘、转轮一次排开，押区押色都直觉',
    },
    classic: {
      name: '即开电子馆',
      short: '即开',
      tagline: '骰子、基诺、弹珠这类短局即开玩法集中在这里',
    },
    strategy: {
      name: '策略挑战馆',
      short: '策略',
      tagline: '逐步选择、随时收手，靠判断把倍率一路推高',
    },
  },
  en: {
    crash: {
      name: 'Crash Flight Hall',
      short: 'Flight',
      tagline: 'Watch the multiplier climb and cash out on time',
    },
    tables: {
      name: 'Table Games Hall',
      short: 'Tables',
      tagline: 'Cards, points and focused table rhythm',
    },
    slots: {
      name: 'Slots Hall',
      short: 'Slots',
      tagline: 'Themes, reels, lines and big-win pacing in one place',
    },
    roulette: {
      name: 'Roulette Hall',
      short: 'Roulette',
      tagline: 'Wheels, colors and intuitive betting zones',
    },
    classic: {
      name: 'Instant Games Hall',
      short: 'Instant',
      tagline: 'Dice, Keno and Plinko-style short rounds',
    },
    strategy: {
      name: 'Strategy Hall',
      short: 'Strategy',
      tagline: 'Choose step by step and cash out when the risk feels right',
    },
  },
  th: {
    crash: {
      name: 'ห้องบิน Crash',
      short: 'บิน',
      tagline: 'ดูตัวคูณไต่ขึ้นและรับรางวัลให้ทันเวลา',
    },
    tables: {
      name: 'ห้องโต๊ะไพ่',
      short: 'โต๊ะ',
      tagline: 'ไพ่ แต้ม และจังหวะโต๊ะที่ต้องใช้สมาธิ',
    },
    slots: {
      name: 'ห้องสล็อต',
      short: 'สล็อต',
      tagline: 'ธีม วงล้อ ไลน์ และจังหวะชนะใหญ่ในที่เดียว',
    },
    roulette: {
      name: 'ห้องรูเล็ต',
      short: 'รูเล็ต',
      tagline: 'วงล้อ สี และโซนเดิมพันที่เข้าใจง่าย',
    },
    classic: {
      name: 'ห้องเกมทันใจ',
      short: 'ทันใจ',
      tagline: 'รอบสั้นอย่าง Dice, Keno และ Plinko',
    },
    strategy: {
      name: 'ห้องกลยุทธ์',
      short: 'กลยุทธ์',
      tagline: 'เลือกทีละก้าวและรับรางวัลเมื่อความเสี่ยงพอดี',
    },
  },
  vi: {
    crash: {
      name: 'Phòng bay Crash',
      short: 'Bay',
      tagline: 'Theo dõi hệ số tăng và rút thưởng đúng lúc',
    },
    tables: {
      name: 'Phòng bàn chơi',
      short: 'Bàn',
      tagline: 'Bài, điểm số và nhịp bàn cần tập trung',
    },
    slots: {
      name: 'Phòng Slot',
      short: 'Slot',
      tagline: 'Chủ đề, vòng quay, dòng thắng và nhịp thắng lớn trong một nơi',
    },
    roulette: {
      name: 'Phòng Roulette',
      short: 'Roulette',
      tagline: 'Vòng quay, màu sắc và vùng cược trực quan',
    },
    classic: {
      name: 'Phòng game tức thì',
      short: 'Tức thì',
      tagline: 'Các ván ngắn như Dice, Keno và Plinko',
    },
    strategy: {
      name: 'Phòng chiến thuật',
      short: 'Chiến thuật',
      tagline: 'Chọn từng bước và rút thưởng khi rủi ro vừa ý',
    },
  },
};

export function getLocalizedHallName(hall: HallMeta, locale: Locale): string {
  return HALL_LABELS[locale][hall.id]?.name ?? hall.nameZh;
}

export function getLocalizedHallTagline(hall: HallMeta, locale: Locale): string {
  return HALL_LABELS[locale][hall.id]?.tagline ?? hall.tagline;
}

export function getLocalizedHallShort(id: HallId, locale: Locale): string {
  return HALL_LABELS[locale][id]?.short ?? HALL_LABELS['zh-Hant'][id]?.short ?? id;
}
