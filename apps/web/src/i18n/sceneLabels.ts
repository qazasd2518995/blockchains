import type { Locale } from './types';

interface KenoSceneLabels {
  readyPrompt: string;
  ready: string;
  drawing: string;
  miss: string;
  hit: (count: number, total: number) => string;
}

interface CrashSceneLabels {
  waiting: string;
  ready: string;
  nextRoundBet: string;
  crashedAt: (multiplier: string) => string;
}

interface HotlineSceneLabels {
  multiplierActivated: string;
  payoutSettled: string;
  payoutPrefix: string;
  megaWinTitles: {
    thunder: { medium: string; big: string };
    dragonMega: { medium: string; big: string };
    nebula: { medium: string; big: string };
    jungle: { medium: string; big: string };
    vampire: { medium: string; big: string };
    default: { medium: string; big: string };
  };
}

export interface SceneLabels {
  keno: KenoSceneLabels;
  crash: CrashSceneLabels;
  hotline: HotlineSceneLabels;
}

export const SCENE_LABELS: Record<Locale, SceneLabels> = {
  'zh-Hant': {
    keno: {
      readyPrompt: 'READY · 按下開始開獎',
      ready: 'READY',
      drawing: 'DRAWING',
      miss: '未命中',
      hit: (count, total) => `命中 ${count} / ${total}`,
    },
    crash: {
      waiting: 'WAITING…',
      ready: 'READY',
      nextRoundBet: '下一回合下注',
      crashedAt: (multiplier) => `CRASHED @ ${multiplier}`,
    },
    hotline: {
      multiplierActivated: '倍數啟動',
      payoutSettled: '派彩結算',
      payoutPrefix: '派彩',
      megaWinTitles: {
        thunder: { medium: '雷霆中獎', big: '雷霆大獎' },
        dragonMega: { medium: '龍焰中獎', big: '龍焰大獎' },
        nebula: { medium: '星河中獎', big: '星河大獎' },
        jungle: { medium: '秘境中獎', big: '秘境大獎' },
        vampire: { medium: '暗夜中獎', big: '暗夜大獎' },
        default: { medium: '中獎', big: '超級大獎' },
      },
    },
  },
  'zh-Hans': {
    keno: {
      readyPrompt: 'READY · 按下开始开奖',
      ready: 'READY',
      drawing: 'DRAWING',
      miss: '未命中',
      hit: (count, total) => `命中 ${count} / ${total}`,
    },
    crash: {
      waiting: 'WAITING…',
      ready: 'READY',
      nextRoundBet: '下一回合下注',
      crashedAt: (multiplier) => `CRASHED @ ${multiplier}`,
    },
    hotline: {
      multiplierActivated: '倍数启动',
      payoutSettled: '派彩结算',
      payoutPrefix: '派彩',
      megaWinTitles: {
        thunder: { medium: '雷霆中奖', big: '雷霆大奖' },
        dragonMega: { medium: '龙焰中奖', big: '龙焰大奖' },
        nebula: { medium: '星河中奖', big: '星河大奖' },
        jungle: { medium: '秘境中奖', big: '秘境大奖' },
        vampire: { medium: '暗夜中奖', big: '暗夜大奖' },
        default: { medium: '中奖', big: '超级大奖' },
      },
    },
  },
  en: {
    keno: {
      readyPrompt: 'READY · Press start to draw',
      ready: 'READY',
      drawing: 'DRAWING',
      miss: 'No hit',
      hit: (count, total) => `Hits ${count} / ${total}`,
    },
    crash: {
      waiting: 'WAITING…',
      ready: 'READY',
      nextRoundBet: 'Next round betting',
      crashedAt: (multiplier) => `CRASHED @ ${multiplier}`,
    },
    hotline: {
      multiplierActivated: 'Multiplier Activated',
      payoutSettled: 'Payout Settled',
      payoutPrefix: 'Payout',
      megaWinTitles: {
        thunder: { medium: 'Thunder Win', big: 'Thunder Big Win' },
        dragonMega: { medium: 'Dragon Win', big: 'Dragon Big Win' },
        nebula: { medium: 'Nebula Win', big: 'Nebula Big Win' },
        jungle: { medium: 'Jungle Win', big: 'Jungle Big Win' },
        vampire: { medium: 'Night Win', big: 'Night Big Win' },
        default: { medium: 'Win', big: 'Super Win' },
      },
    },
  },
  th: {
    keno: {
      readyPrompt: 'พร้อม · กดเริ่มเพื่อออกรางวัล',
      ready: 'พร้อม',
      drawing: 'กำลังออกรางวัล',
      miss: 'ไม่ถูกรางวัล',
      hit: (count, total) => `ถูก ${count} / ${total}`,
    },
    crash: {
      waiting: 'กำลังรอ…',
      ready: 'พร้อม',
      nextRoundBet: 'เดิมพันรอบถัดไป',
      crashedAt: (multiplier) => `CRASH ที่ ${multiplier}`,
    },
    hotline: {
      multiplierActivated: 'เปิดใช้ตัวคูณ',
      payoutSettled: 'สรุปรางวัลแล้ว',
      payoutPrefix: 'รางวัล',
      megaWinTitles: {
        thunder: { medium: 'Thunder ชนะ', big: 'Thunder ชนะใหญ่' },
        dragonMega: { medium: 'Dragon ชนะ', big: 'Dragon ชนะใหญ่' },
        nebula: { medium: 'Nebula ชนะ', big: 'Nebula ชนะใหญ่' },
        jungle: { medium: 'Jungle ชนะ', big: 'Jungle ชนะใหญ่' },
        vampire: { medium: 'Night ชนะ', big: 'Night ชนะใหญ่' },
        default: { medium: 'ชนะ', big: 'ชนะใหญ่' },
      },
    },
  },
  vi: {
    keno: {
      readyPrompt: 'Sẵn sàng · Nhấn bắt đầu để quay số',
      ready: 'Sẵn sàng',
      drawing: 'Đang quay số',
      miss: 'Không trúng',
      hit: (count, total) => `Trúng ${count} / ${total}`,
    },
    crash: {
      waiting: 'Đang chờ…',
      ready: 'Sẵn sàng',
      nextRoundBet: 'Cược ván sau',
      crashedAt: (multiplier) => `CRASH tại ${multiplier}`,
    },
    hotline: {
      multiplierActivated: 'Kích hoạt hệ số',
      payoutSettled: 'Đã kết toán trả thưởng',
      payoutPrefix: 'Trả thưởng',
      megaWinTitles: {
        thunder: { medium: 'Thunder thắng', big: 'Thunder thắng lớn' },
        dragonMega: { medium: 'Dragon thắng', big: 'Dragon thắng lớn' },
        nebula: { medium: 'Nebula thắng', big: 'Nebula thắng lớn' },
        jungle: { medium: 'Jungle thắng', big: 'Jungle thắng lớn' },
        vampire: { medium: 'Night thắng', big: 'Night thắng lớn' },
        default: { medium: 'Thắng', big: 'Siêu thắng' },
      },
    },
  },
};

export function getSceneLabels(locale: Locale): SceneLabels {
  return SCENE_LABELS[locale] ?? SCENE_LABELS['zh-Hant'];
}
