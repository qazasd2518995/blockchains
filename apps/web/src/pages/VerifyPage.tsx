import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { canAccessLocalTableBeta } from '@bg/shared';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { MobilePageHeader } from '@/components/layout/MobilePageHeader';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { toSimplified } from '@/i18n/dict.zh-Hans';
import type { Locale } from '@/i18n/types';
import { useTranslation } from '@/i18n/useTranslation';
import { useAuthStore } from '@/stores/authStore';

type HallKey = 'crash' | 'tables' | 'slots' | 'roulette' | 'classic' | 'strategy';

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
    key: 'tables',
    title: '棋牌牌桌館',
    subtitle: 'Card Table Hall',
    tone: '#C9A247',
    intro: '21 點、比大小都屬於牌類判斷，集中在同一個牌桌館。',
    vibe: '看牌路、算點數、抓節奏',
  },
  {
    key: 'slots',
    title: '拉霸館',
    subtitle: 'Slots Hall',
    tone: '#C97736',
    intro: '轉軸、符號、連線派彩集中管理，想玩老虎機直接進這一館。',
    vibe: '主題爆分、短局連開',
  },
  {
    key: 'roulette',
    title: '輪盤館',
    subtitle: 'Roulette Hall',
    tone: '#EA580C',
    intro: '輪盤、轉輪、嘉年華輪盤都歸在輪盤轉輪類，下注區域更直覺。',
    vibe: '押號押色、轉停開獎',
  },
  {
    key: 'classic',
    title: '即開電子館',
    subtitle: 'Instant Hall',
    tone: '#EA580C',
    intro: '骰子、基諾、彈珠這類短局即開玩法，規則直觀，節奏乾淨。',
    vibe: '快速開獎、輕鬆順手',
  },
  {
    key: 'strategy',
    title: '策略挑戰館',
    subtitle: 'Strategy Hall',
    tone: '#5B8C40',
    intro: '掃雷與爬階梯都需要逐步判斷與隨時收手，每一個選擇都影響獎金。',
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
    id: 'baccarat',
    hall: 'tables',
    name: '皇家百家',
    english: 'Royal Baccarat',
    cover: '/game-art/baccarat/cover.png',
    rtp: '98.94%',
    maxMultiplier: '25×',
    duration: '單局 20–40 秒',
    intro: '經典牌桌玩法，押莊、閒、和或對子邊注，封盤後發牌開結果。',
    howToPlay: [
      '進桌後先選桌台，封盤前把籌碼押在莊、閒、和或邊注區。',
      '封盤後系統依百家樂補牌規則發牌並自動判定勝負。',
      '中獎區域依桌面賠率即時派彩，未中則扣除當局下注。',
    ],
    tips: '百家樂核心在桌台節奏與換桌判斷，盯住路單比一味重押更重要。',
  },
  {
    id: 'baccarat-nova',
    hall: 'tables',
    name: '星耀百家',
    english: 'Nova Baccarat',
    cover: '/games/baccarat.jpg',
    rtp: '98.94%',
    maxMultiplier: '25×',
    duration: '單局 20–40 秒',
    intro: '霓虹影棚風格真人百家樂，規則與經典百家一致。',
    howToPlay: [
      '進桌後選擇桌台，封盤前把籌碼押在莊、閒、和或邊注區。',
      '封盤後依百家樂補牌規則發牌並自動判定勝負。',
      '中獎區域依桌面賠率即時派彩，未中則扣除當局下注。',
    ],
    tips: '星耀百家節奏偏明快，適合想快速換桌追牌路的玩家。',
  },
  {
    id: 'baccarat-imperial',
    hall: 'tables',
    name: '御龍百家',
    english: 'Imperial Baccarat',
    cover: '/game-art/baccarat/background.png',
    rtp: '98.94%',
    maxMultiplier: '25×',
    duration: '單局 20–40 秒',
    intro: '紅金御龍風格真人百家樂，保留經典牌路與逐局封盤。',
    howToPlay: [
      '進桌後選擇桌台，封盤前把籌碼押在莊、閒、和或邊注區。',
      '封盤後依百家樂補牌規則發牌並自動判定勝負。',
      '中獎區域依桌面賠率即時派彩，未中則扣除當局下注。',
    ],
    tips: '御龍百家視覺更沉穩，適合長時間觀察牌路與桌台節奏。',
  },
  {
    id: 'baccarat-dragon',
    hall: 'tables',
    name: '龍姬百家',
    english: 'Dragon Empress Baccarat',
    cover: '/game-art/baccarat-table/dragon-cover.webp',
    rtp: '98.94%',
    maxMultiplier: '9×',
    duration: '單局 10–40 秒',
    intro: '紅金龍姬主題百家樂，押閒、莊、和後依標準補牌表即時開牌。',
    howToPlay: [
      '選擇閒家、莊家或和局下注門。',
      '下注後系統發出閒莊各兩張，Natural 8/9 直接停牌。',
      '非 Natural 時依閒家與莊家第三張牌規則補牌並結算。',
    ],
    tips: '閒莊下注遇和退回本金；莊勝扣 5% commission，和局倍率高但命中率低。',
  },
  {
    id: 'baccarat-panda',
    hall: 'tables',
    name: '熊貓百家',
    english: 'Panda Palace Baccarat',
    cover: '/game-art/baccarat-table/panda-cover.webp',
    rtp: '98.94%',
    maxMultiplier: '9×',
    duration: '單局 10–40 秒',
    intro: '玉殿熊貓主題百家樂，保留閒莊和三門下注與標準補牌規則。',
    howToPlay: [
      '選擇閒家、莊家或和局下注門。',
      '系統依閒、莊、閒、莊順序發出前兩張。',
      '依正式第三張牌表補牌，點數較高者勝，和局同點。',
    ],
    tips: '百家樂只看點數個位數，10/J/Q/K 都算 0 點。',
  },
  {
    id: 'baccarat-fox',
    hall: 'tables',
    name: '狐姬百家',
    english: 'Fox Spirit Baccarat',
    cover: '/game-art/baccarat-table/fox-cover.webp',
    rtp: '98.94%',
    maxMultiplier: '9×',
    duration: '單局 10–40 秒',
    intro: '月夜狐姬主題百家樂，畫面簡化不顯示牌路，專注單局開牌。',
    howToPlay: [
      '下注閒、莊或和。',
      '任一方前兩張為 8 或 9 點時，直接以 Natural 結算。',
      '其餘局面由系統依標準補牌表自動完成。',
    ],
    tips: '和局是高倍率選項，但一般閒莊下注遇和只退回本金。',
  },
  {
    id: 'baccarat-tiger',
    hall: 'tables',
    name: '虎爵百家',
    english: 'Tiger Royale Baccarat',
    cover: '/game-art/baccarat-table/tiger-cover.webp',
    rtp: '98.94%',
    maxMultiplier: '9×',
    duration: '單局 10–40 秒',
    intro: '黑金虎爵主題百家樂，使用標準 Punto Banco 補牌規則。',
    howToPlay: [
      '選擇一個下注門並設定下注金額。',
      '閒家 0-5 點補牌、6-7 點停牌。',
      '莊家依閒家第三張牌點數決定是否補牌。',
    ],
    tips: '莊家勝派彩為 1.95x，已包含 5% commission。',
  },
  {
    id: 'baccarat-phoenix',
    hall: 'tables',
    name: '鳳凰百家',
    english: 'Phoenix Baccarat',
    cover: '/game-art/baccarat-table/phoenix-cover.webp',
    rtp: '98.94%',
    maxMultiplier: '9×',
    duration: '單局 10–40 秒',
    intro: '藍金鳳凰主題百家樂，三門下注、單局即開，不顯示牌路節省空間。',
    howToPlay: [
      '選擇閒、莊、和其中一門。',
      '下注後閒莊各依規則補牌到最終點數。',
      '閒勝 2.00x、莊勝 1.95x、和勝 9.00x，未中為 0。',
    ],
    tips: '同點為和；如果你押閒或莊，和局會退回本金。',
  },
  {
    id: 'blackjack',
    hall: 'tables',
    name: '21點',
    english: 'Blackjack 21',
    cover: '/game-art/blackjack/cover.png',
    rtp: '97%',
    maxMultiplier: '2×',
    duration: '單局 10–40 秒',
    intro: '正式 21 點牌桌玩法，玩家與莊家比點數，Blackjack 按 3:2 派彩。',
    howToPlay: [
      '起手玩家與莊家各兩張，莊家一張暗牌，玩家可補牌、停牌、加倍或分牌。',
      '點數超過 21 即爆牌；A 可算 1 或 11，J/Q/K 算 10。',
      '莊家 16 點含以下補牌，17 點含以上停牌。',
    ],
    tips: '兩張起手牌同點數可分牌，A 分牌後每手只補一張。',
  },
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
    intro: 'X3 視覺主題的噴射機 Crash，倍率起飛後需在爆炸前領獎。',
    howToPlay: [
      '下注後等待噴射機起飛，倍率會隨時間上升。',
      '倍率達到目標時點擊領獎，或設定自動領獎倍率。',
      '噴射機爆炸前未領獎，本局下注歸零。',
    ],
    tips: '可用自動領獎鎖定基礎倍率，再用手動操作追更高倍率。',
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
    intro: 'Double X 視覺主題的 Crash，玩法以單一即時倍率領獎為核心。',
    howToPlay: [
      '下注後倍率開始上升，越晚領獎風險越高。',
      '爆掉前領獎即可依當下倍率派彩。',
      '可設定自動領獎，避免錯過目標倍率。',
    ],
    tips: '建議先設定自動領獎，再依現場倍率手動調整策略。',
  },
  {
    id: 'plinkox',
    hall: 'classic',
    name: '掉珠挑戰 X',
    english: 'Plinko X',
    cover: '/games/plinko-x.jpg',
    rtp: '96.5%',
    maxMultiplier: '165×',
    duration: '單局 3 秒',
    intro: 'X 視覺主題彈珠台，彈珠穿越釘陣後落入倍率槽結算。',
    howToPlay: [
      '設定彈珠列數（8–12）與風險等級。',
      '點擊「掉落」釋放彈珠，系統即時播放下落動畫。',
      '彈珠落定後依倍率槽自動結算。',
    ],
    tips: '高風險模式邊緣槽倍率較高，但落入中央低倍率槽的機率也較高。',
  },
  {
    id: 'dice',
    hall: 'classic',
    name: '骰子',
    english: 'Dice',
    cover: '/game-art/dice/cover.png',
    rtp: '97%',
    maxMultiplier: '32.33×',
    duration: '單局 3 秒',
    intro: '經典 Dice 玩法，預測點數低於門檻或大於等於門檻即贏。',
    howToPlay: [
      '設定門檻值（3.00–97.00）並選擇「Over」或「Under」。',
      '系統開出 0.00–99.99 的點數，符合預測即勝出。',
      '勝率越低、賠率越高，依門檻自動換算。',
    ],
    tips: '骰子賠率依 97% RTP 換算，退水後仍維持負期望。',
  },
  {
    id: 'roulette',
    hall: 'roulette',
    name: '迷你輪盤',
    english: 'Mini Roulette',
    cover: '/game-art/mini-roulette/cover.png',
    rtp: '96.15%',
    maxMultiplier: '12×',
    duration: '單局 8 秒',
    intro: '13 格迷你輪盤，下注號碼或紅黑、奇偶、大小皆可。',
    howToPlay: [
      '在桌面下注號碼、顏色、奇偶或區段。',
      '所有下注確認後點擊「開始旋轉」開球。',
      '球落定後依下注區自動派彩；未覆蓋 0 的下注出 0 時半退。',
    ],
    tips: '單號賠率 11:1，外圍下注勝率較高、賠率較低，依風格選擇。',
  },
  {
    id: 'wheel',
    hall: 'roulette',
    name: '彩色轉輪',
    english: 'Color Wheel',
    cover: '/game-art/wheel/cover.png',
    rtp: '96.5%',
    maxMultiplier: '48.25×',
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
    hall: 'slots',
    name: '霓虹熱線',
    english: 'Hotline',
    cover: '/slots/cyber/cover.png',
    rtp: '96%',
    maxMultiplier: '1,000×',
    duration: '單局 5 秒',
    intro: '霓虹風格老虎機，5 軸 3 列盤面，固定線可由左側或右側起算派彩。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '盤面停下後，符號需在同一條固定線上由最左或最右連續相同才派彩。',
      '可開啟自動旋轉模式連續開局。',
    ],
    tips: '搭配霓虹視覺與電子音效，適合輕鬆放鬆型玩家。',
  },
  {
    id: 'temple-slot',
    hall: 'slots',
    name: '聖殿寶石',
    english: 'Temple Gems 3x3',
    cover: '/slots/temple/cover.png',
    rtp: '97%',
    maxMultiplier: '625×',
    duration: '單局 4 秒',
    intro: '金色聖殿風格 3x3 老虎機，採用上中下與兩條斜線共 5 條固定派彩線。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '盤面停下後依 3x3 固定線自動結算，同一條線三個符號相同即派彩。',
      '三軸節奏更快，適合短局連玩。',
    ],
    tips: '3x3 盤面更直接，注意斜線也可能形成中獎。',
  },
  {
    id: 'candy-slot',
    hall: 'slots',
    name: '糖果派對',
    english: 'Candy Party 3x3',
    cover: '/slots/candy/cover.png',
    rtp: '97%',
    maxMultiplier: '625×',
    duration: '單局 4 秒',
    intro: '糖果霓虹風格 3x3 老虎機，輕快節奏搭配 5 條固定中獎線。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '三個轉軸停下後系統自動判定橫線與斜線上的三連相同符號。',
      '中獎線可同時累計派彩。',
    ],
    tips: '適合想快速體驗老虎機連線感的玩家。',
  },
  {
    id: 'sakura-slot',
    hall: 'slots',
    name: '夜櫻武士',
    english: 'Sakura Blade 3x3',
    cover: '/slots/sakura/cover.png',
    rtp: '97%',
    maxMultiplier: '625×',
    duration: '單局 4 秒',
    intro: '夜櫻武士風格 3x3 老虎機，黑金舞台搭配 5 條固定派彩線。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '符合任一橫線或斜線的三連相同符號時自動派彩。',
      '多條線同時成立時倍率會加總。',
    ],
    tips: '盤面小、節奏快，適合快速判斷每局結果。',
  },
  {
    id: 'thunder-slot',
    hall: 'slots',
    name: '索爾神槌',
    english: 'Thor Hammer Mega',
    cover: '/slots/thunder/cover.png',
    rtp: '96.5%',
    maxMultiplier: '5,000×+',
    duration: '單局 5 秒',
    intro: '6 軸 5 列 Mega 老虎機，同符號計數派彩，含連鎖消除、倍數符號與免費旋轉。',
    howToPlay: [
      '選擇下注金額後點擊「旋轉」開始。',
      '同一符號在盤面累積達指定數量即可派彩，派彩後會進入連鎖消除。',
      '基礎局累積 4 個以上 SCATTER 觸發免費旋轉；免費局 3 個以上 SCATTER 追加次數。',
    ],
    tips: '適合喜歡雷電爆分、連鎖視覺與高波動節奏的玩家。',
  },
  {
    id: 'dragon-mega-slot',
    hall: 'slots',
    name: '龍焰巨輪',
    english: 'Dragon Blaze Mega',
    cover: '/slots/dragon-mega/cover.png',
    rtp: '96.5%',
    maxMultiplier: '5,000×+',
    duration: '單局 5 秒',
    intro: '龍焰主題 6x5 計數派彩老虎機，低倍回本、高倍爆分、免費旋轉與特殊倍數會交錯出現。',
    howToPlay: [
      '下注後旋轉 6 軸 5 列盤面。',
      '盤面上相同符號累積越多，基礎倍率越高。',
      '倍數符號會套用在本局贏分；免費旋轉中倍數會持續累積。',
    ],
    tips: '龍焰巨輪適合追求中高波動與視覺爆發感。',
  },
  {
    id: 'nebula-slot',
    hall: 'slots',
    name: '星河寶藏',
    english: 'Nebula Fortune',
    cover: '/slots/nebula/cover.png',
    rtp: '96.5%',
    maxMultiplier: '5,000×+',
    duration: '單局 5 秒',
    intro: '科幻星河風格 6x5 計數派彩老虎機，重點是小派彩、連鎖消除與偶發高倍。',
    howToPlay: [
      '同一符號在盤面累積達指定數量即有派彩。',
      '多個符號同時成立時，系統會合計全部倍率。',
      '派彩可能小於下注；若出現倍數符號或免費旋轉，獎金會繼續放大。',
    ],
    tips: '星河寶藏節奏偏中波動，適合連玩觀察方式累積。',
  },
  {
    id: 'jungle-slot',
    hall: 'slots',
    name: '秘境遺跡',
    english: 'Jungle Relic Mega',
    cover: '/slots/jungle/cover.png',
    rtp: '96.5%',
    maxMultiplier: '5,000×+',
    duration: '單局 5 秒',
    intro: '雨林遺跡風格 6x5 計數派彩老虎機，低倍符號容易形成回本獎，SCATTER 可開免費旋轉。',
    howToPlay: [
      '轉軸停止後自動檢查同符號累積數量。',
      '低階符號可形成 0.3x、0.5x 等小派彩。',
      '免費旋轉中取得倍數符號會累積倍率，後續中獎會用累積倍率放大。',
    ],
    tips: '秘境遺跡適合想要較多小中獎提示的玩家。',
  },
  {
    id: 'vampire-slot',
    hall: 'slots',
    name: '暗夜古堡',
    english: 'Vampire Castle Mega',
    cover: '/slots/vampire/cover.png',
    rtp: '96.5%',
    maxMultiplier: '5,000×+',
    duration: '單局 5 秒',
    intro: '哥德暗夜風格 6x5 計數派彩老虎機，部分回本、高倍古堡符號、特殊倍數與免費旋轉並存。',
    howToPlay: [
      '下注後旋轉，同符號累積達指定數量才派彩。',
      '總倍率小於 1x 時仍會顯示小中獎派彩，但盈虧為負。',
      '達到高倍、倍數符號加成或免費旋轉累積時會顯示爆分慶祝動畫。',
    ],
    tips: '暗夜古堡視覺較強烈，適合追求戲劇化結算感。',
  },
  {
    id: 'keno',
    hall: 'classic',
    name: '基諾',
    english: 'Keno',
    cover: '/game-art/keno/cover.png',
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
    hall: 'tables',
    name: '猜大小',
    english: 'Hi-Lo',
    cover: '/game-art/hilo/cover.png',
    rtp: '96.5%',
    maxMultiplier: '999×',
    duration: '可連續多局',
    intro: '猜下一張牌大於等於或小於等於目前牌，連對越多倍率越高。',
    howToPlay: [
      '系統發出第一張牌，預測下一張大於等於或小於等於它。',
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
    cover: '/game-art/mines/cover.png',
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
    name: '爬階梯',
    english: 'Stairs',
    cover: '/game-art/tower/cover.png',
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
    id: 'chicken-road',
    hall: 'strategy',
    name: '小雞過馬路',
    english: 'Chicken Road',
    cover: '/game-art/chicken-road/cover.png',
    rtp: '97%',
    maxMultiplier: '50,000×',
    duration: '可連續多局',
    intro: '下注後讓小雞一格一格穿越車道，安全通過就提高倍率，命中車流則本局歸零。',
    howToPlay: [
      '選擇難度與下注金額後開始本局。',
      '每次點擊前進一步會揭曉下一條車道是否安全。',
      '安全時倍率上升，可繼續挑戰或立即領取；未通過車道則失去本局下注。',
    ],
    tips: '難度越高單步倍率越快，但未通過機率也越高；想穩定累積就提早領取。',
  },
  {
    id: 'plinko',
    hall: 'classic',
    name: '彈珠台',
    english: 'Plinko',
    cover: '/game-art/plinko/cover.png',
    rtp: '96.5%',
    maxMultiplier: '165×',
    duration: '單局 3 秒',
    intro: '彈珠穿越釘陣自由落下，落入哪個倍率槽就拿那個倍率。',
    howToPlay: [
      '設定彈珠列數（8–12）與風險等級。',
      '點擊「掉落」釋放彈珠，系統即時播放下落動畫。',
      '彈珠落定後依倍率槽自動結算。',
    ],
    tips: '高風險模式邊緣槽倍率極高，但中央落點機率較低。',
  },
];

const HIDDEN_GAME_IDS = new Set([
  'baccarat',
  'baccarat-nova',
  'baccarat-imperial',
  'chicken-road',
]);
const VISIBLE_GAMES = GAMES.filter((game) => !HIDDEN_GAME_IDS.has(game.id));
const LEGACY_TABLE_GUIDE_GAME_IDS = new Set(['blackjack', 'hilo']);

type GuideTextLocale = 'en' | 'th' | 'vi';
type LocalizedGuideCopy = Pick<Game, 'intro' | 'howToPlay' | 'tips'>;

interface VerifyPageCopy {
  title: string;
  allPlays: string;
  allGames: string;
  countLabel: (count: number) => string;
  allWithCount: (count: number) => string;
  heroTitle: (count: number) => string;
  heroDescription: string;
  chips: [string, string, string];
  enterLobby: string;
  hallFilterTitle: string;
  catalogueEyebrow: string;
  catalogueTitleAll: (count: number) => string;
  catalogueTitleHall: (hallTitle: string) => string;
  catalogueDescription: string;
  maxMultiplier: string;
  duration: string;
  durationShort: string;
  stepsTitle: string;
  tipPrefix: string;
}

const VERIFY_COPY: Record<Locale, VerifyPageCopy> = {
  'zh-Hant': {
    title: '遊戲說明',
    allPlays: '全部玩法',
    allGames: '全部遊戲',
    countLabel: (count) => `${count} 款`,
    allWithCount: (count) => `全部 ${count} 款`,
    heroTitle: (count) => `${count} 款人氣玩法，一頁讀懂規則與賠率。`,
    heroDescription:
      '飛行、棋牌牌桌、拉霸、輪盤、即開電子、策略挑戰六大主題館，從快節奏 Crash 到講究手牌判斷的 21 點與比大小，挑你今晚最想開的那一桌。每款遊戲都附上玩法步驟、RTP 與最高倍率，幫你快速上手。',
    chips: ['RTP 96%–97%', '最高 1,000,000×', '即時派彩到帳'],
    enterLobby: '直接進入大廳',
    hallFilterTitle: '挑一館深入看玩法',
    catalogueEyebrow: 'Game Catalogue',
    catalogueTitleAll: (count) => `${count} 款遊戲完整玩法`,
    catalogueTitleHall: (hallTitle) => `${hallTitle} 玩法詳解`,
    catalogueDescription: '點開卡片看每款遊戲的下注步驟、賠率上限與操作要點。',
    maxMultiplier: '最高倍率',
    duration: '單局時長',
    durationShort: '時長',
    stepsTitle: '玩法步驟',
    tipPrefix: '小提示：',
  },
  'zh-Hans': {
    title: '游戏说明',
    allPlays: '全部玩法',
    allGames: '全部游戏',
    countLabel: (count) => `${count} 款`,
    allWithCount: (count) => `全部 ${count} 款`,
    heroTitle: (count) => `${count} 款人气玩法，一页读懂规则与赔率。`,
    heroDescription:
      '飞行、棋牌牌桌、拉霸、轮盘、即开电子、策略挑战六大主题馆，从快节奏 Crash 到讲究手牌判断的 21 点与比大小，挑你今晚最想开的那一桌。每款游戏都附上玩法步骤、RTP 与最高倍率，帮你快速上手。',
    chips: ['RTP 96%–97%', '最高 1,000,000×', '即时派彩到账'],
    enterLobby: '直接进入大厅',
    hallFilterTitle: '挑一馆深入看玩法',
    catalogueEyebrow: 'Game Catalogue',
    catalogueTitleAll: (count) => `${count} 款游戏完整玩法`,
    catalogueTitleHall: (hallTitle) => `${hallTitle} 玩法详解`,
    catalogueDescription: '点开卡片看每款游戏的下注步骤、赔率上限与操作要点。',
    maxMultiplier: '最高倍率',
    duration: '单局时长',
    durationShort: '时长',
    stepsTitle: '玩法步骤',
    tipPrefix: '小提示：',
  },
  en: {
    title: 'Game Guide',
    allPlays: 'All Modes',
    allGames: 'All Games',
    countLabel: (count) => `${count} games`,
    allWithCount: (count) => `All ${count} games`,
    heroTitle: (count) => `${count} popular games with rules and payout limits in one place.`,
    heroDescription:
      'Flight, table games, slots, roulette, instant games and strategy challenges are grouped into clear halls. Each card explains how to bet, what to watch and the maximum multiplier so you can start quickly.',
    chips: ['RTP 96%–97%', 'Up to 1,000,000×', 'Instant payout'],
    enterLobby: 'Enter Lobby',
    hallFilterTitle: 'Choose a hall to learn more',
    catalogueEyebrow: 'Game Catalogue',
    catalogueTitleAll: (count) => `How all ${count} games work`,
    catalogueTitleHall: (hallTitle) => `${hallTitle} guide`,
    catalogueDescription: 'Open a card to review betting steps, payout limits and play tips.',
    maxMultiplier: 'Max Multiplier',
    duration: 'Round Time',
    durationShort: 'Time',
    stepsTitle: 'How to Play',
    tipPrefix: 'Tip: ',
  },
  th: {
    title: 'คู่มือเกม',
    allPlays: 'ทุกประเภท',
    allGames: 'ทุกเกม',
    countLabel: (count) => `${count} เกม`,
    allWithCount: (count) => `ทั้งหมด ${count} เกม`,
    heroTitle: (count) => `${count} เกมยอดนิยม พร้อมกติกาและเพดานรางวัลในหน้าเดียว`,
    heroDescription:
      'ห้องบิน โต๊ะไพ่ สล็อต รูเล็ต เกมทันใจ และเกมกลยุทธ์ถูกจัดเป็นหมวดชัดเจน การ์ดแต่ละเกมบอกวิธีเดิมพัน จุดที่ต้องดู และตัวคูณสูงสุดเพื่อให้เริ่มเล่นได้ทันที',
    chips: ['RTP 96%–97%', 'สูงสุด 1,000,000×', 'จ่ายรางวัลทันที'],
    enterLobby: 'เข้าล็อบบี้',
    hallFilterTitle: 'เลือกห้องเพื่อดูรายละเอียด',
    catalogueEyebrow: 'Game Catalogue',
    catalogueTitleAll: (count) => `วิธีเล่นครบ ${count} เกม`,
    catalogueTitleHall: (hallTitle) => `คู่มือ ${hallTitle}`,
    catalogueDescription: 'เปิดการ์ดเพื่อดูขั้นตอนเดิมพัน เพดานรางวัล และเคล็ดลับการเล่น',
    maxMultiplier: 'ตัวคูณสูงสุด',
    duration: 'เวลาแต่ละรอบ',
    durationShort: 'เวลา',
    stepsTitle: 'วิธีเล่น',
    tipPrefix: 'เคล็ดลับ: ',
  },
  vi: {
    title: 'Hướng dẫn game',
    allPlays: 'Tất cả cách chơi',
    allGames: 'Tất cả game',
    countLabel: (count) => `${count} game`,
    allWithCount: (count) => `Tất cả ${count} game`,
    heroTitle: (count) => `${count} game phổ biến với luật chơi và giới hạn trả thưởng trong một trang.`,
    heroDescription:
      'Phòng bay, bàn chơi, slot, roulette, game tức thì và thử thách chiến thuật được chia rõ ràng. Mỗi thẻ game có bước cược, điểm cần chú ý và hệ số tối đa để bạn bắt đầu nhanh.',
    chips: ['RTP 96%–97%', 'Tối đa 1,000,000×', 'Trả thưởng tức thì'],
    enterLobby: 'Vào sảnh',
    hallFilterTitle: 'Chọn phòng để xem kỹ hơn',
    catalogueEyebrow: 'Game Catalogue',
    catalogueTitleAll: (count) => `Hướng dẫn đầy đủ ${count} game`,
    catalogueTitleHall: (hallTitle) => `Hướng dẫn ${hallTitle}`,
    catalogueDescription: 'Mở thẻ để xem các bước cược, giới hạn trả thưởng và mẹo thao tác.',
    maxMultiplier: 'Hệ số tối đa',
    duration: 'Thời gian ván',
    durationShort: 'Thời gian',
    stepsTitle: 'Cách chơi',
    tipPrefix: 'Mẹo: ',
  },
};

const NON_TABLE_HERO_DESCRIPTION: Record<Locale, string> = {
  'zh-Hant':
    '飛行、拉霸、輪盤、即開電子、策略挑戰五大主題館，從快節奏 Crash 到骰子、基諾、彈珠與策略玩法，都附上玩法步驟、RTP 與最高倍率，幫你快速上手。',
  'zh-Hans':
    '飞行、拉霸、轮盘、即开电子、策略挑战五大主题馆，从快节奏 Crash 到骰子、基诺、弹珠与策略玩法，都附上玩法步骤、RTP 与最高倍率，帮你快速上手。',
  en: 'Flight, slots, roulette, instant games and strategy challenges are grouped into clear halls. Each card explains how to bet, what to watch and the maximum multiplier so you can start quickly.',
  th: 'ห้องบิน สล็อต รูเล็ต เกมทันใจ และเกมกลยุทธ์ถูกจัดเป็นหมวดชัดเจน การ์ดแต่ละเกมบอกวิธีเดิมพัน จุดที่ต้องดู และตัวคูณสูงสุดเพื่อให้เริ่มเล่นได้ทันที',
  vi: 'Flight, slot, roulette, game nhanh và thử thách chiến lược được chia thành các sảnh rõ ràng. Mỗi thẻ giải thích cách cược, điểm cần chú ý và hệ số tối đa để bắt đầu nhanh.',
};

const HALL_TEXT: Record<GuideTextLocale, Record<HallKey, Pick<Hall, 'title' | 'subtitle' | 'intro' | 'vibe'>>> = {
  en: {
    crash: {
      title: 'Crash Flight Hall',
      subtitle: 'Crash Hall',
      intro: 'The multiplier rises over time. Cash out before the crash to lock in the payout.',
      vibe: 'Fast rhythm and timing pressure',
    },
    tables: {
      title: 'Table Games Hall',
      subtitle: 'Card Table Hall',
      intro: 'Blackjack, Hi-Lo and baccarat-style games focus on cards, points and table rhythm.',
      vibe: 'Read the cards, count points, control pace',
    },
    slots: {
      title: 'Slots Hall',
      subtitle: 'Slots Hall',
      intro: 'Reels, symbols, paylines and count-pay slot formats are grouped in one hall.',
      vibe: 'Theme spins, quick rounds, big wins',
    },
    roulette: {
      title: 'Roulette Hall',
      subtitle: 'Roulette Hall',
      intro: 'Roulette and wheel games use intuitive betting zones for numbers, colors and segments.',
      vibe: 'Pick zones, watch the wheel stop',
    },
    classic: {
      title: 'Instant Games Hall',
      subtitle: 'Instant Hall',
      intro: 'Dice, Keno and Plinko-style games are short, direct and easy to read.',
      vibe: 'Quick reveals and clean rules',
    },
    strategy: {
      title: 'Strategy Challenge Hall',
      subtitle: 'Strategy Hall',
      intro: 'Mines and Stairs ask you to choose step by step and decide when to cash out.',
      vibe: 'Every choice changes the payout',
    },
  },
  th: {
    crash: {
      title: 'ห้องบิน Crash',
      subtitle: 'Crash Hall',
      intro: 'ตัวคูณจะไต่ขึ้นตามเวลา กดรับรางวัลก่อนเกมจบเพื่อเก็บยอดชนะ',
      vibe: 'จังหวะเร็วและต้องตัดสินใจทัน',
    },
    tables: {
      title: 'ห้องโต๊ะไพ่',
      subtitle: 'Card Table Hall',
      intro: 'Blackjack, Hi-Lo และเกมแนวไพ่เน้นแต้ม ไพ่ในมือ และจังหวะโต๊ะ',
      vibe: 'อ่านไพ่ คิดแต้ม คุมจังหวะ',
    },
    slots: {
      title: 'ห้องสล็อต',
      subtitle: 'Slots Hall',
      intro: 'รวมเกมวงล้อ สัญลักษณ์ ไลน์จ่าย และสล็อตแบบนับสัญลักษณ์ไว้ในห้องเดียว',
      vibe: 'ธีมเด่น รอบสั้น ลุ้นชนะใหญ่',
    },
    roulette: {
      title: 'ห้องรูเล็ต',
      subtitle: 'Roulette Hall',
      intro: 'รูเล็ตและเกมวงล้อมีโซนเดิมพันเลข สี และช่องรางวัลที่ดูง่าย',
      vibe: 'เลือกโซนแล้วลุ้นวงล้อหยุด',
    },
    classic: {
      title: 'ห้องเกมทันใจ',
      subtitle: 'Instant Hall',
      intro: 'Dice, Keno และ Plinko เป็นเกมรอบสั้น กติกาตรง และรู้ผลไว',
      vibe: 'เปิดผลเร็ว เล่นง่าย',
    },
    strategy: {
      title: 'ห้องกลยุทธ์',
      subtitle: 'Strategy Hall',
      intro: 'Mines และ Stairs ให้เลือกทีละขั้นและตัดสินใจว่าจะรับรางวัลเมื่อไร',
      vibe: 'ทุกตัวเลือกมีผลกับรางวัล',
    },
  },
  vi: {
    crash: {
      title: 'Phòng bay Crash',
      subtitle: 'Crash Hall',
      intro: 'Hệ số tăng theo thời gian. Rút thưởng trước khi ván crash để khóa tiền thắng.',
      vibe: 'Nhịp nhanh, cần canh thời điểm',
    },
    tables: {
      title: 'Phòng bàn chơi',
      subtitle: 'Card Table Hall',
      intro: 'Blackjack, Hi-Lo và các game bài tập trung vào lá bài, điểm số và nhịp bàn.',
      vibe: 'Đọc bài, tính điểm, giữ nhịp',
    },
    slots: {
      title: 'Phòng Slot',
      subtitle: 'Slots Hall',
      intro: 'Các game vòng quay, biểu tượng, dòng thắng và slot trả thưởng theo số lượng được gom tại đây.',
      vibe: 'Chủ đề rõ, ván ngắn, thắng lớn',
    },
    roulette: {
      title: 'Phòng Roulette',
      subtitle: 'Roulette Hall',
      intro: 'Roulette và vòng quay dùng vùng cược trực quan cho số, màu và các ô thưởng.',
      vibe: 'Chọn vùng cược rồi chờ vòng quay dừng',
    },
    classic: {
      title: 'Phòng game tức thì',
      subtitle: 'Instant Hall',
      intro: 'Dice, Keno và Plinko là các ván ngắn, luật rõ và mở kết quả nhanh.',
      vibe: 'Mở thưởng nhanh, dễ theo dõi',
    },
    strategy: {
      title: 'Phòng chiến thuật',
      subtitle: 'Strategy Hall',
      intro: 'Mines và Stairs yêu cầu chọn từng bước và quyết định thời điểm rút thưởng.',
      vibe: 'Mỗi lựa chọn đều ảnh hưởng tiền thắng',
    },
  },
};

const GUIDE_GAME_LABEL_IDS: Record<string, string> = {
  doublex: 'double-x',
  fleet: 'space-fleet',
  plinkox: 'plinko-x',
  roulette: 'mini-roulette',
};

const DURATION_TEXT: Record<GuideTextLocale, Record<string, string>> = {
  en: {
    '單局 20–40 秒': '20-40 sec/round',
    '單局 10–40 秒': '10-40 sec/round',
    '5–30 秒': '5-30 sec',
    '8–35 秒': '8-35 sec',
    '6–30 秒': '6-30 sec',
    '5–25 秒': '5-25 sec',
    '單局 3 秒': '3 sec/round',
    '單局 4 秒': '4 sec/round',
    '單局 5 秒': '5 sec/round',
    '單局 6 秒': '6 sec/round',
    '單局 8 秒': '8 sec/round',
    可連續多局: 'Multi-step round',
  },
  th: {
    '單局 20–40 秒': 'รอบละ 20-40 วินาที',
    '單局 10–40 秒': 'รอบละ 10-40 วินาที',
    '5–30 秒': '5-30 วินาที',
    '8–35 秒': '8-35 วินาที',
    '6–30 秒': '6-30 วินาที',
    '5–25 秒': '5-25 วินาที',
    '單局 3 秒': 'รอบละ 3 วินาที',
    '單局 4 秒': 'รอบละ 4 วินาที',
    '單局 5 秒': 'รอบละ 5 วินาที',
    '單局 6 秒': 'รอบละ 6 วินาที',
    '單局 8 秒': 'รอบละ 8 วินาที',
    可連續多局: 'เล่นต่อเนื่องได้',
  },
  vi: {
    '單局 20–40 秒': '20-40 giây/ván',
    '單局 10–40 秒': '10-40 giây/ván',
    '5–30 秒': '5-30 giây',
    '8–35 秒': '8-35 giây',
    '6–30 秒': '6-30 giây',
    '5–25 秒': '5-25 giây',
    '單局 3 秒': '3 giây/ván',
    '單局 4 秒': '4 giây/ván',
    '單局 5 秒': '5 giây/ván',
    '單局 6 秒': '6 giây/ván',
    '單局 8 秒': '8 giây/ván',
    可連續多局: 'Ván nhiều bước',
  },
};

function isGuideTextLocale(locale: Locale): locale is GuideTextLocale {
  return locale === 'en' || locale === 'th' || locale === 'vi';
}

function localizeGuideHalls(locale: Locale): Hall[] {
  if (isGuideTextLocale(locale)) {
    return HALLS.map((hall) => ({ ...hall, ...HALL_TEXT[locale][hall.key] }));
  }

  if (locale === 'zh-Hans') {
    return HALLS.map((hall) => ({
      ...hall,
      title: toSimplified(hall.title),
      intro: toSimplified(hall.intro),
      vibe: toSimplified(hall.vibe),
    }));
  }

  return HALLS;
}

function localizeGuideGame(game: Game, locale: Locale): Game {
  if (locale === 'zh-Hans') {
    return {
      ...game,
      name: getLocalizedGuideGameTitle(game, locale),
      duration: toSimplified(game.duration),
      intro: toSimplified(game.intro),
      howToPlay: game.howToPlay.map((step) => toSimplified(step)),
      tips: toSimplified(game.tips),
    };
  }

  if (!isGuideTextLocale(locale)) {
    return game;
  }

  const name = getLocalizedGuideGameTitle(game, locale);
  return {
    ...game,
    name,
    duration: localizeDuration(game.duration, locale),
    ...getLocalizedGuideCopy(game, locale, name),
  };
}

function getLocalizedGuideGameTitle(game: Game, locale: Locale): string {
  return getLocalizedGameTitle(GUIDE_GAME_LABEL_IDS[game.id] ?? game.id, locale, game.name);
}

function localizeDuration(duration: string, locale: GuideTextLocale): string {
  return DURATION_TEXT[locale][duration] ?? duration;
}

function getLocalizedGuideCopy(
  game: Game,
  locale: GuideTextLocale,
  name: string,
): LocalizedGuideCopy {
  if (locale === 'en') return getEnglishGuideCopy(game, name);
  if (locale === 'th') return getThaiGuideCopy(game, name);
  return getVietnameseGuideCopy(game, name);
}

function getEnglishGuideCopy(game: Game, name: string): LocalizedGuideCopy {
  if (game.hall === 'crash') {
    return {
      intro: `${name} is a Crash game where the multiplier climbs in real time. Cash out before the round ends to win.`,
      howToPlay: [
        'Place a bet before the round starts and watch the multiplier rise.',
        'Cash out manually or set an auto cashout target before the crash.',
        'If the round crashes before cashout, that bet loses.',
      ],
      tips: 'Use auto cashout to lock a base target, then adjust your risk by round pace.',
    };
  }

  if (game.hall === 'slots') {
    return {
      intro: `${name} is a slot game built around quick spins, symbol results and instant payout checks.`,
      howToPlay: [
        'Choose your stake and press Spin to start the round.',
        'When the reels stop, the system checks paylines or matching symbol counts automatically.',
        'Wins are paid instantly; auto spin can run repeated rounds with the same stake.',
      ],
      tips: 'Mega slots have higher volatility, while 3x3 slots are faster and easier to read.',
    };
  }

  switch (game.id) {
    case 'blackjack':
      return {
        intro: 'Blackjack compares your hand against the dealer. Reach 21 or beat the dealer without busting.',
        howToPlay: [
          'Start with two cards and choose hit, stand, double or split when available.',
          'Face cards count as 10, A can count as 1 or 11, and totals over 21 bust.',
          'The dealer draws by fixed rules, then winning hands are paid by the table odds.',
        ],
        tips: 'Splits and doubles change the risk quickly, so use them only when the hand supports it.',
      };
    case 'hilo':
      return {
        intro: 'Hi-Lo asks whether the next card will be higher/equal or lower/equal than the current card.',
        howToPlay: [
          'Check the current card and choose High or Low for the next draw.',
          'Correct guesses raise the multiplier and let you continue or cash out.',
          'A wrong guess ends the round and the current prize is lost.',
        ],
        tips: 'Cash out after a good streak instead of forcing every chain to continue.',
      };
    case 'dice':
      return {
        intro: 'Dice lets you predict whether the result will land over or under your target number.',
        howToPlay: [
          'Set a target from 3.00 to 97.00 and choose Over or Under.',
          'The system rolls a value from 0.00 to 99.99.',
          'If the result matches your prediction, payout is calculated from the win chance.',
        ],
        tips: 'Lower win chance creates higher odds, but every setting still follows the same RTP.',
      };
    case 'keno':
      return {
        intro: 'Keno lets you pick 1-10 numbers from 1-40. More hits create higher payouts.',
        howToPlay: [
          'Select 1-10 numbers on the number board.',
          'The system draws 10 winning numbers for the round.',
          'Your payout depends on how many selected numbers match and the selected risk level.',
        ],
        tips: 'Low risk is steadier; high risk is for chasing rare hit combinations.',
      };
    case 'roulette':
      return {
        intro: 'Mini Roulette uses a 13-slot wheel. Bet on numbers, colors, odd/even or ranges.',
        howToPlay: [
          'Place chips on numbers or outside betting zones.',
          'Start the spin after all bets are set.',
          'When the ball stops, covered winning zones pay by their listed odds.',
        ],
        tips: 'Single numbers pay more; outside bets hit more often with lower payout.',
      };
    case 'wheel':
      return {
        intro: 'Color Wheel pays when the pointer stops on the color you selected.',
        howToPlay: [
          'Choose the wheel size and risk style.',
          'Place your color bet and start the spin.',
          'The stopped segment decides the payout multiplier.',
        ],
        tips: 'Use lower risk for steadier results or higher risk for sharper payout swings.',
      };
    case 'plinkox':
    case 'plinko':
      return {
        intro: `${name} drops a ball through pegs into multiplier slots at the bottom.`,
        howToPlay: [
          'Choose the row count, risk level and stake.',
          'Press Drop to release the ball and watch the path.',
          'The final bucket decides the multiplier and payout.',
        ],
        tips: 'High risk gives larger edge multipliers but lower odds of landing there.',
      };
    case 'mines':
      return {
        intro: 'Mines hides bombs inside a 5x5 board. Reveal safe gems and cash out before hitting a mine.',
        howToPlay: [
          'Choose the number of mines and start the round.',
          'Each safe tile raises the multiplier and current payout.',
          'Cash out anytime, or lose the round if you reveal a mine.',
        ],
        tips: 'More mines raise the payout faster but leave fewer safe choices.',
      };
    case 'tower':
      return {
        intro: 'Stairs is a step-by-step challenge. Pick the safe tile on each level to climb higher.',
        howToPlay: [
          'Choose a difficulty and place your bet.',
          'Pick one tile per level and avoid the trap.',
          'Cash out anytime; hitting a trap ends the round.',
        ],
        tips: 'Expert and Master scale quickly, so define a cashout level before you start.',
      };
    case 'chicken-road':
      return {
        intro: 'Chicken Road raises the multiplier each step you cross safely.',
        howToPlay: [
          'Choose difficulty and stake, then start the road.',
          'Advance one lane at a time to reveal whether it is safe.',
          'Cash out on any safe step or lose the stake if the step fails.',
        ],
        tips: 'Higher difficulty grows faster, but early cashout keeps the route under control.',
      };
    default:
      return {
        intro: `${name} is a fast game with clear rules, instant settlement and visible payout limits.`,
        howToPlay: [
          'Choose your stake and start the round.',
          'Follow the round result and available action buttons.',
          'Winning results are settled instantly into your balance.',
        ],
        tips: 'Start with a small stake until the round rhythm feels familiar.',
      };
  }
}

function getThaiGuideCopy(game: Game, name: string): LocalizedGuideCopy {
  if (game.hall === 'crash') {
    return {
      intro: `${name} เป็นเกม Crash ที่ตัวคูณเพิ่มขึ้นแบบเรียลไทม์ รับรางวัลก่อนรอบจบเพื่อชนะ`,
      howToPlay: [
        'วางเดิมพันก่อนเริ่มรอบ แล้วดูตัวคูณไต่ขึ้น',
        'กดรับรางวัลเอง หรือกำหนดเป้าหมายรับอัตโนมัติก่อนเกมจบ',
        'ถ้าเกมจบก่อนรับรางวัล เดิมพันรอบนั้นจะแพ้',
      ],
      tips: 'ตั้งรับอัตโนมัติเพื่อล็อกเป้าหมายพื้นฐาน แล้วปรับความเสี่ยงตามจังหวะรอบ',
    };
  }

  if (game.hall === 'slots') {
    return {
      intro: `${name} เป็นเกมสล็อตรอบสั้น ตรวจผลสัญลักษณ์และจ่ายรางวัลทันที`,
      howToPlay: [
        'เลือกเงินเดิมพัน แล้วกด Spin เพื่อเริ่มรอบ',
        'เมื่อวงล้อหยุด ระบบจะตรวจไลน์จ่ายหรือจำนวนสัญลักษณ์ที่ตรงกันให้อัตโนมัติ',
        'รางวัลจะเข้าทันที และสามารถใช้ Auto Spin เล่นหลายรอบด้วยเงินเดิมพันเดิม',
      ],
      tips: 'สล็อต Mega ผันผวนกว่า ส่วนสล็อต 3x3 อ่านผลง่ายและจบรอบเร็ว',
    };
  }

  switch (game.id) {
    case 'blackjack':
      return {
        intro: 'Blackjack คือการแข่งแต้มกับเจ้ามือ เป้าหมายคือเข้าใกล้ 21 โดยไม่เกิน',
        howToPlay: [
          'เริ่มด้วยไพ่สองใบ แล้วเลือกจั่ว หยุด เพิ่มเดิมพัน หรือแยกไพ่เมื่อทำได้',
          'ไพ่หน้า J/Q/K นับ 10, A นับได้ 1 หรือ 11 และแต้มเกิน 21 จะแพ้ทันที',
          'เจ้ามือจั่วตามกติกาคงที่ จากนั้นมือที่ชนะจะจ่ายตามอัตราโต๊ะ',
        ],
        tips: 'การแยกไพ่และเพิ่มเดิมพันเปลี่ยนความเสี่ยงเร็ว ควรใช้เมื่อหน้าไพ่เหมาะ',
      };
    case 'hilo':
      return {
        intro: 'Hi-Lo ให้ทายว่าไพ่ใบถัดไปจะสูงกว่า/เท่ากับ หรือ ต่ำกว่า/เท่ากับใบปัจจุบัน',
        howToPlay: [
          'ดูไพ่ปัจจุบัน แล้วเลือก High หรือ Low สำหรับไพ่ใบถัดไป',
          'ถ้าทายถูก ตัวคูณจะเพิ่ม และเลือกเล่นต่อหรือรับรางวัลได้',
          'ถ้าทายผิด รอบจะจบและรางวัลสะสมจะหายไป',
        ],
        tips: 'เมื่อได้สตรีคดีแล้วควรรับรางวัล ไม่จำเป็นต้องฝืนเล่นต่อทุกครั้ง',
      };
    case 'dice':
      return {
        intro: 'Dice ให้ทายว่าผลจะออกมากกว่าหรือน้อยกว่าเลขเป้าหมายที่ตั้งไว้',
        howToPlay: [
          'ตั้งค่าเป้าหมาย 3.00 ถึง 97.00 แล้วเลือก Over หรือ Under',
          'ระบบจะสุ่มผล 0.00 ถึง 99.99',
          'ถ้าผลตรงกับที่ทาย รางวัลจะคำนวณตามโอกาสชนะ',
        ],
        tips: 'โอกาสชนะต่ำให้อัตราจ่ายสูงขึ้น แต่ทุกค่าจะอิง RTP เดียวกัน',
      };
    case 'keno':
      return {
        intro: 'Keno ให้เลือก 1-10 หมายเลขจาก 1-40 ยิ่งถูกมาก รางวัลยิ่งสูง',
        howToPlay: [
          'เลือกหมายเลข 1-10 ตัวบนกระดาน',
          'ระบบจะเปิดหมายเลขรางวัล 10 ตัวในแต่ละรอบ',
          'รางวัลขึ้นกับจำนวนที่ถูกและระดับความเสี่ยงที่เลือก',
        ],
        tips: 'ความเสี่ยงต่ำเหมาะกับการเล่นนิ่ง ส่วนความเสี่ยงสูงเหมาะกับการลุ้นชุดถูกยาก',
      };
    case 'roulette':
      return {
        intro: 'Mini Roulette ใช้วงล้อ 13 ช่อง เดิมพันได้ทั้งเลข สี คี่/คู่ หรือช่วงเลข',
        howToPlay: [
          'วางชิปบนเลขหรือโซนเดิมพันรอบนอก',
          'ตั้งเดิมพันครบแล้วกดเริ่มหมุน',
          'เมื่อลูกหยุด โซนที่ครอบคลุมผลชนะจะจ่ายตามอัตราที่แสดง',
        ],
        tips: 'เลขเดี่ยวจ่ายสูงกว่า ส่วนเดิมพันรอบนอกมีโอกาสเข้าเยอะกว่าแต่จ่ายต่ำกว่า',
      };
    case 'wheel':
      return {
        intro: 'Color Wheel จะจ่ายเมื่อเข็มหยุดบนสีที่คุณเดิมพัน',
        howToPlay: [
          'เลือกขนาดวงล้อและระดับความเสี่ยง',
          'วางเดิมพันสี แล้วกดหมุน',
          'ช่องที่หยุดจะกำหนดตัวคูณรางวัล',
        ],
        tips: 'เลือกความเสี่ยงต่ำเพื่อความนิ่ง หรือความเสี่ยงสูงเพื่อรางวัลที่แกว่งแรงขึ้น',
      };
    case 'plinkox':
    case 'plinko':
      return {
        intro: `${name} ปล่อยลูกบอลผ่านหมุดลงไปยังช่องตัวคูณด้านล่าง`,
        howToPlay: [
          'เลือกจำนวนแถว ระดับความเสี่ยง และเงินเดิมพัน',
          'กด Drop เพื่อปล่อยลูกบอลและดูเส้นทาง',
          'ช่องสุดท้ายที่ลูกตกจะกำหนดตัวคูณและรางวัล',
        ],
        tips: 'ความเสี่ยงสูงมีตัวคูณขอบกระดานสูงกว่า แต่โอกาสตกช่องนั้นต่ำกว่า',
      };
    case 'mines':
      return {
        intro: 'Mines ซ่อนระเบิดในกระดาน 5x5 เปิดช่องปลอดภัยแล้วรับรางวัลก่อนเจอระเบิด',
        howToPlay: [
          'เลือกจำนวนระเบิดแล้วเริ่มรอบ',
          'ทุกช่องปลอดภัยที่เปิดจะเพิ่มตัวคูณและรางวัลปัจจุบัน',
          'รับรางวัลได้ทุกเวลา หรือจะแพ้รอบนั้นถ้าเปิดเจอระเบิด',
        ],
        tips: 'ยิ่งมีระเบิดมาก ตัวคูณขึ้นเร็ว แต่ตัวเลือกปลอดภัยจะน้อยลง',
      };
    case 'tower':
      return {
        intro: 'Stairs เป็นเกมเลือกทีละชั้น เลือกช่องปลอดภัยเพื่อไต่ขึ้นไปให้สูงขึ้น',
        howToPlay: [
          'เลือกระดับความยากและวางเดิมพัน',
          'เลือกหนึ่งช่องในแต่ละชั้นเพื่อหลบกับดัก',
          'รับรางวัลได้ทุกเวลา ถ้าเจอกับดักรอบจะจบ',
        ],
        tips: 'ระดับ Expert และ Master ขึ้นตัวคูณไว ควรกำหนดชั้นที่จะรับรางวัลก่อนเริ่ม',
      };
    case 'chicken-road':
      return {
        intro: 'Chicken Road เพิ่มตัวคูณทุกครั้งที่ข้ามช่องได้อย่างปลอดภัย',
        howToPlay: [
          'เลือกระดับความยากและเงินเดิมพัน แล้วเริ่มเส้นทาง',
          'เดินหน้าทีละช่องเพื่อดูว่าช่องนั้นปลอดภัยหรือไม่',
          'รับรางวัลได้ทุกช่องที่ปลอดภัย หรือเสียเดิมพันถ้าข้ามไม่ผ่าน',
        ],
        tips: 'ความยากสูงโตเร็วกว่า แต่การรับรางวัลเร็วช่วยคุมเส้นทางได้ดีกว่า',
      };
    default:
      return {
        intro: `${name} เป็นเกมรอบเร็ว กติกาชัดเจน จ่ายรางวัลทันที และเห็นเพดานรางวัลชัดเจน`,
        howToPlay: [
          'เลือกเงินเดิมพันแล้วเริ่มรอบ',
          'ดูผลรอบและใช้ปุ่มคำสั่งที่มีอยู่',
          'ผลที่ชนะจะถูกจ่ายเข้ายอดเงินทันที',
        ],
        tips: 'เริ่มด้วยเดิมพันเล็กก่อนจนคุ้นกับจังหวะของเกม',
      };
  }
}

function getVietnameseGuideCopy(game: Game, name: string): LocalizedGuideCopy {
  if (game.hall === 'crash') {
    return {
      intro: `${name} là game Crash có hệ số tăng theo thời gian thực. Rút thưởng trước khi ván kết thúc để thắng.`,
      howToPlay: [
        'Đặt cược trước khi ván bắt đầu và theo dõi hệ số tăng.',
        'Rút thưởng thủ công hoặc đặt mục tiêu rút tự động trước khi ván crash.',
        'Nếu ván crash trước khi rút thưởng, cược đó sẽ thua.',
      ],
      tips: 'Dùng rút tự động để khóa mục tiêu cơ bản, rồi điều chỉnh rủi ro theo nhịp ván.',
    };
  }

  if (game.hall === 'slots') {
    return {
      intro: `${name} là slot ván ngắn, kiểm tra biểu tượng và trả thưởng ngay sau khi quay.`,
      howToPlay: [
        'Chọn tiền cược rồi nhấn Spin để bắt đầu.',
        'Khi vòng quay dừng, hệ thống tự kiểm tra dòng thắng hoặc số biểu tượng trùng.',
        'Thắng được trả ngay; Auto Spin có thể chạy nhiều ván cùng mức cược.',
      ],
      tips: 'Slot Mega biến động cao hơn, còn slot 3x3 nhanh và dễ đọc kết quả hơn.',
    };
  }

  switch (game.id) {
    case 'blackjack':
      return {
        intro: 'Blackjack so điểm bài của bạn với nhà cái. Mục tiêu là gần 21 hơn mà không bị quá điểm.',
        howToPlay: [
          'Bắt đầu với hai lá bài và chọn rút, dừng, nhân đôi hoặc tách bài khi có thể.',
          'J/Q/K tính 10, A tính 1 hoặc 11, tổng trên 21 là bù.',
          'Nhà cái rút theo luật cố định, sau đó tay thắng được trả theo tỷ lệ bàn.',
        ],
        tips: 'Tách bài và nhân đôi làm rủi ro thay đổi nhanh, chỉ dùng khi thế bài phù hợp.',
      };
    case 'hilo':
      return {
        intro: 'Hi-Lo yêu cầu đoán lá kế tiếp sẽ cao hơn/bằng hoặc thấp hơn/bằng lá hiện tại.',
        howToPlay: [
          'Xem lá hiện tại rồi chọn High hoặc Low cho lá kế tiếp.',
          'Đoán đúng sẽ tăng hệ số và cho phép chơi tiếp hoặc rút thưởng.',
          'Đoán sai làm ván kết thúc và mất thưởng đang tích lũy.',
        ],
        tips: 'Sau một chuỗi tốt, rút thưởng sớm thường ổn định hơn là cố kéo dài mọi lượt.',
      };
    case 'dice':
      return {
        intro: 'Dice cho phép dự đoán kết quả sẽ cao hơn hoặc thấp hơn mốc bạn đặt.',
        howToPlay: [
          'Đặt mốc từ 3.00 đến 97.00 rồi chọn Over hoặc Under.',
          'Hệ thống mở kết quả từ 0.00 đến 99.99.',
          'Nếu kết quả đúng dự đoán, thưởng được tính theo xác suất thắng.',
        ],
        tips: 'Xác suất thắng thấp tạo tỷ lệ cao hơn, nhưng mọi thiết lập vẫn theo cùng RTP.',
      };
    case 'keno':
      return {
        intro: 'Keno cho phép chọn 1-10 số từ 1-40. Trúng càng nhiều, thưởng càng cao.',
        howToPlay: [
          'Chọn 1-10 số trên bảng số.',
          'Hệ thống mở 10 số trúng cho ván đó.',
          'Thưởng phụ thuộc số lượng trùng khớp và mức rủi ro đã chọn.',
        ],
        tips: 'Rủi ro thấp ổn định hơn; rủi ro cao dành cho các tổ hợp trúng hiếm.',
      };
    case 'roulette':
      return {
        intro: 'Mini Roulette dùng vòng 13 ô. Có thể cược số, màu, chẵn/lẻ hoặc khoảng số.',
        howToPlay: [
          'Đặt chip lên số hoặc vùng cược bên ngoài.',
          'Sau khi đặt cược xong, bắt đầu quay.',
          'Khi bi dừng, vùng cược trúng được trả theo tỷ lệ hiển thị.',
        ],
        tips: 'Cược số đơn trả cao hơn; cược ngoài dễ trúng hơn nhưng trả thấp hơn.',
      };
    case 'wheel':
      return {
        intro: 'Color Wheel trả thưởng khi kim dừng ở màu bạn đã cược.',
        howToPlay: [
          'Chọn kích thước vòng quay và mức rủi ro.',
          'Đặt cược màu rồi bắt đầu quay.',
          'Ô dừng cuối cùng quyết định hệ số trả thưởng.',
        ],
        tips: 'Chọn rủi ro thấp để ổn định hơn hoặc rủi ro cao để nhắm mức trả thưởng mạnh hơn.',
      };
    case 'plinkox':
    case 'plinko':
      return {
        intro: `${name} thả bóng qua hàng chốt xuống các ô hệ số phía dưới.`,
        howToPlay: [
          'Chọn số hàng, mức rủi ro và tiền cược.',
          'Nhấn Drop để thả bóng và theo dõi đường rơi.',
          'Ô cuối cùng bóng rơi vào quyết định hệ số và tiền thưởng.',
        ],
        tips: 'Rủi ro cao có hệ số biên lớn hơn nhưng xác suất rơi vào đó thấp hơn.',
      };
    case 'mines':
      return {
        intro: 'Mines giấu bom trong bảng 5x5. Mở ô an toàn và rút thưởng trước khi trúng bom.',
        howToPlay: [
          'Chọn số bom rồi bắt đầu ván.',
          'Mỗi ô an toàn được mở sẽ tăng hệ số và tiền thưởng hiện tại.',
          'Có thể rút thưởng bất cứ lúc nào; mở trúng bom sẽ thua ván.',
        ],
        tips: 'Càng nhiều bom thì hệ số tăng nhanh hơn, nhưng lựa chọn an toàn ít hơn.',
      };
    case 'tower':
      return {
        intro: 'Stairs là thử thách từng tầng. Chọn ô an toàn ở mỗi tầng để leo cao hơn.',
        howToPlay: [
          'Chọn độ khó và đặt cược.',
          'Mỗi tầng chọn một ô để tránh bẫy.',
          'Có thể rút thưởng bất cứ lúc nào; trúng bẫy sẽ kết thúc ván.',
        ],
        tips: 'Expert và Master tăng hệ số rất nhanh, nên đặt sẵn tầng rút thưởng trước khi chơi.',
      };
    case 'chicken-road':
      return {
        intro: 'Chicken Road tăng hệ số sau mỗi bước vượt đường an toàn.',
        howToPlay: [
          'Chọn độ khó và tiền cược rồi bắt đầu tuyến đường.',
          'Tiến từng làn để mở xem bước đó có an toàn không.',
          'Rút thưởng ở bất kỳ bước an toàn nào hoặc mất cược nếu bước đó thất bại.',
        ],
        tips: 'Độ khó cao tăng nhanh hơn, nhưng rút thưởng sớm giúp kiểm soát tuyến đường tốt hơn.',
      };
    default:
      return {
        intro: `${name} là game nhịp nhanh, luật rõ, kết toán tức thì và hiển thị giới hạn thưởng rõ ràng.`,
        howToPlay: [
          'Chọn tiền cược rồi bắt đầu ván.',
          'Theo dõi kết quả ván và các nút thao tác có sẵn.',
          'Kết quả thắng sẽ được cộng vào số dư ngay.',
        ],
        tips: 'Bắt đầu với mức cược nhỏ cho đến khi quen nhịp game.',
      };
  }
}

export function VerifyPage() {
  const { locale } = useTranslation();
  const username = useAuthStore((state) => state.user?.username ?? null);
  const canSeeLocalTables = canAccessLocalTableBeta(username);
  const [activeHall, setActiveHall] = useState<HallKey | 'all'>('all');
  const baseCopy = VERIFY_COPY[locale];
  const copy = useMemo(
    () =>
      canSeeLocalTables
        ? baseCopy
        : { ...baseCopy, heroDescription: NON_TABLE_HERO_DESCRIPTION[locale] },
    [baseCopy, canSeeLocalTables, locale],
  );
  const halls = useMemo(
    () => localizeGuideHalls(locale).filter((hall) => canSeeLocalTables || hall.key !== 'tables'),
    [canSeeLocalTables, locale],
  );
  const visibleGames = useMemo(
    () =>
      VISIBLE_GAMES.filter(
        (game) =>
          canSeeLocalTables ||
          game.hall !== 'tables' ||
          LEGACY_TABLE_GUIDE_GAME_IDS.has(game.id),
      ).map((game) =>
        localizeGuideGame(
          !canSeeLocalTables && game.hall === 'tables'
            ? { ...game, hall: 'classic' }
            : game,
          locale,
        ),
      ),
    [canSeeLocalTables, locale],
  );

  useEffect(() => {
    if (activeHall !== 'all' && !halls.some((hall) => hall.key === activeHall)) {
      setActiveHall('all');
    }
  }, [activeHall, halls]);
  const hallFilters = useMemo<Array<{ key: HallKey | 'all'; title: string; count: number }>>(
    () => [
      { key: 'all', title: copy.allPlays, count: visibleGames.length },
      ...halls.map((hall) => ({
        key: hall.key,
        title: hall.title,
        count: visibleGames.filter((game) => game.hall === hall.key).length,
      })),
    ],
    [copy, halls, visibleGames],
  );

  const filteredGames =
    activeHall === 'all' ? visibleGames : visibleGames.filter((g) => g.hall === activeHall);
  const activeHallMeta =
    activeHall === 'all' ? null : halls.find((hall) => hall.key === activeHall);

  return (
    <>
      <div className="min-h-[100svh] bg-[#EDF4F7] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
        <MobilePageHeader title={copy.title} subtitle="GAME GUIDE" active="verify" />

        <section className="border-b border-[#D1E0E7] bg-[#EDF4F7]/96 px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {hallFilters.map((filter) => {
              const active = activeHall === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveHall(filter.key)}
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-[10px] border px-3 text-[12px] font-black shadow-[0_4px_10px_rgba(15,23,42,0.06)] transition active:scale-[0.99] ${
                    active
                      ? 'border-[#EA580C] bg-[#EA580C] text-white'
                      : 'border-[#FED7AA] bg-white text-[#9A3412]'
                  }`}
                >
                  <span>{filter.title}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? 'bg-white/18 text-white' : 'bg-[#FFF7ED] text-[#C2410C]'
                    }`}
                  >
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2 px-2 py-2">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#FED7AA] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#F97316]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">
                {activeHallMeta ? activeHallMeta.title : copy.allGames}
              </span>
            </div>
            <span className="rounded-full bg-[#FFF7ED] px-2 py-1 text-[11px] font-bold text-[#C2410C]">
              {copy.countLabel(filteredGames.length)}
            </span>
          </div>

          <div className="grid gap-2">
            {filteredGames.map((game) => {
              const hall = halls.find((h) => h.key === game.hall)!;
              return <MobileGuideGameCard key={game.id} game={game} hall={hall} copy={copy} />;
            })}
          </div>
        </section>
      </div>

      <div className="verify-page hidden max-w-full space-y-5 overflow-x-hidden pb-24 sm:space-y-8 sm:pb-0 lg:block">
        <section className="grid min-w-0 gap-3 sm:gap-6 xl:grid-cols-12">
          <div className="relative min-w-0 max-w-full overflow-hidden rounded-[20px] bg-[#0F172A] p-4 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)] sm:rounded-[28px] sm:p-6 md:p-8 xl:col-span-8 2xl:col-span-9">
            <img
              src="/backgrounds/game-guide-bg.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[68%_center] sm:object-[72%_center]"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,15,28,0.96)_0%,rgba(7,15,28,0.9)_42%,rgba(7,15,28,0.52)_100%)]" />

            <div className="relative z-10">
              <div className="label !text-white/[0.55]">Game Guide</div>
              <div className="mt-3 flex items-start gap-3 sm:mt-4 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/10 sm:h-12 sm:w-12">
                  <BookOpen className="h-5 w-5 text-[#E8D48A] sm:h-6 sm:w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 max-w-full">
                  <h1 className="max-w-full break-words text-[24px] font-bold leading-[1.12] [overflow-wrap:anywhere] sm:text-[32px] md:text-[40px]">
                    {copy.heroTitle(visibleGames.length)}
                  </h1>
                  <p className="mt-3 max-w-3xl break-words text-[13px] leading-6 text-white/[0.78] [overflow-wrap:anywhere] sm:text-[14px] sm:leading-relaxed">
                    {copy.heroDescription}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex gap-2 overflow-x-auto pb-1 text-[12px] sm:mt-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {copy.chips.map((chip) => (
                  <span
                    key={chip}
                    className="shrink-0 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
                <Link
                  to="/lobby"
                  className="btn-chip border-white/15 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/[0.12]"
                >
                  {copy.enterLobby}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <aside className="min-w-0 max-w-full overflow-hidden rounded-[22px] border border-white/[0.65] bg-white/[0.92] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[24px] sm:p-6 xl:col-span-4 2xl:col-span-3">
            <div className="label">Hall Filter</div>
            <h2 className="mt-2 text-[18px] font-bold text-[#0F172A] sm:mt-3 sm:text-[20px]">
              {copy.hallFilterTitle}
            </h2>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-4 sm:block sm:space-y-2 sm:overflow-visible sm:px-0 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveHall('all')}
                className={`flex shrink-0 items-center justify-between gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition sm:w-full ${
                  activeHall === 'all'
                    ? 'border-[#0F172A] bg-[#0F172A] text-white'
                    : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#0F172A]/40'
                  }`}
              >
                <span>{copy.allWithCount(visibleGames.length)}</span>
                <span className="text-[12px] opacity-70">{visibleGames.length}</span>
              </button>
              {halls.map((hall) => {
                const count = visibleGames.filter((g) => g.hall === hall.key).length;
                const active = activeHall === hall.key;
                return (
                  <button
                    key={hall.key}
                    type="button"
                    onClick={() => setActiveHall(hall.key)}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition sm:w-full ${
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

        <section className="space-y-4 sm:space-y-5">
          <SectionHeading
            eyebrow={copy.catalogueEyebrow}
            title={
              activeHall === 'all'
                ? copy.catalogueTitleAll(visibleGames.length)
                : copy.catalogueTitleHall(halls.find((h) => h.key === activeHall)?.title ?? '')
            }
            description={copy.catalogueDescription}
          />

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredGames.map((game) => {
              const hall = halls.find((h) => h.key === game.hall)!;
              return (
                <article
                  key={game.id}
                  className="relative flex flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0B1322] text-white shadow-[0_16px_40px_rgba(2,6,23,0.45)] sm:rounded-[22px]"
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

                  <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-6">
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
                        <h3 className="mt-3 text-[21px] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-[24px]">
                          {game.name}
                        </h3>
                        <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/55">
                          {game.english}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-[13px] leading-relaxed text-white/80">{game.intro}</p>

                    <dl className="mt-4 grid grid-cols-3 gap-1.5 rounded-[14px] border border-white/10 bg-white/[0.06] p-2.5 text-center backdrop-blur sm:mt-5 sm:gap-2 sm:rounded-[16px] sm:p-3">
                      <Stat label="RTP" value={game.rtp} />
                      <Stat label={copy.maxMultiplier} value={game.maxMultiplier} />
                      <Stat label={copy.duration} value={game.duration} />
                    </dl>

                    <div className="mt-4 sm:mt-5">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E8D48A]">
                        {copy.stepsTitle}
                      </div>
                      <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-white/85 sm:text-[13px]">
                        {game.howToPlay.map((step, index) => (
                          <li key={index} className="flex gap-2">
                            <span className="font-semibold text-[#F3D67D]">{index + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="mt-4 rounded-[14px] border border-[#E8D48A]/35 bg-[#1F1A0E]/70 p-3 text-[12px] leading-relaxed text-[#F5DFA0] backdrop-blur sm:mt-5">
                      <span className="font-semibold text-[#FFE8B0]">{copy.tipPrefix}</span>
                      {game.tips}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function MobileGuideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-[#FED7AA] bg-white px-2 py-2 text-center">
      <div className="truncate text-[10px] font-black text-[#7A8B97]">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-black text-[#12333E]">{value}</div>
    </div>
  );
}

function MobileGuideGameCard({
  game,
  hall,
  copy,
}: {
  game: Game;
  hall: Hall;
  copy: VerifyPageCopy;
}) {
  return (
    <article className="overflow-hidden rounded-[13px] border border-[#FED7AA] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)]">
      <div className="flex gap-2.5 p-2.5">
        <img
          src={game.cover}
          alt={game.name}
          className="h-[88px] w-[112px] shrink-0 rounded-[10px] object-cover"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex max-w-full rounded-[8px] px-2 py-1 text-[10px] font-black text-white"
            style={{ backgroundColor: hall.tone }}
          >
            <span className="truncate">{hall.title}</span>
          </div>
          <h2 className="mt-1.5 text-[18px] font-black leading-tight text-[#12333E] [overflow-wrap:anywhere]">
            {game.name}
          </h2>
          <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-[0.18em] text-[#7A8B97]">
            {game.english}
          </p>
          <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-5 text-[#516976]">
            {game.intro}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-1.5 border-y border-[#FED7AA]/60 bg-[#FFF7ED] px-2 py-2">
        <MobileGuideMetric label="RTP" value={game.rtp} />
        <MobileGuideMetric label={copy.maxMultiplier} value={game.maxMultiplier} />
        <MobileGuideMetric label={copy.durationShort} value={game.duration} />
      </dl>

      <div className="space-y-2 p-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9A3412]">
          {copy.stepsTitle}
        </div>
        <ol className="space-y-1.5">
          {game.howToPlay.map((step, index) => (
            <li
              key={index}
              className="flex gap-2 text-[12px] font-semibold leading-5 text-[#365663]"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-[10px] font-black text-[#C2410C]">
                {index + 1}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{step}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-[10px] border border-[#EFE2B0] bg-[#FFF9E8] px-2.5 py-2 text-[12px] font-semibold leading-5 text-[#6A5320] [overflow-wrap:anywhere]">
          <span className="font-black text-[#9B7420]">{copy.tipPrefix}</span>
          {game.tips}
        </div>
      </div>
    </article>
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
