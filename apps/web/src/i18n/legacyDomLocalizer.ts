import { en } from './dict.en';
import { th } from './dict.th';
import { vi } from './dict.vi';
import { zhHant } from './dict.zh-Hant';
import { zhHans, toSimplified } from './dict.zh-Hans';
import type { Locale } from './types';

const TEXT_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;
const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

const LEGACY_ENGLISH_TEXT: Record<string, string> = {
  公告: 'Latest',
  優惠: 'Promos',
  熱門: 'Hot',
  熱門遊戲: 'Popular Games',
  飛行: 'Flight',
  牌桌: 'Tables',
  拉霸: 'Slots',
  輪盤: 'Roulette',
  即開: 'Instant',
  策略: 'Strategy',
  大廳: 'Lobby',
  記錄: 'Records',
  彩金: 'Jackpot',
  無上限: 'No Limit',
  倍數符號: 'Multiplier Symbol',
  符號: 'Symbols',
  霓虹熱線: 'Hotline',
  '霓虹燈牌、電光符號與左右雙向固定線派彩。':
    'Neon signs, electric symbols and fixed paylines from both sides.',
  待機中: 'Standby',
  轉軸加速中: 'Reels speeding up',
  加速: 'Fast',
  賠率表: 'Paytable',
  待觸發: 'Pending',
  免費旋轉: 'Free Spins',
  免費旋轉中: 'Free Spins',
  請將手機轉為橫向: 'Rotate your phone sideways',
  'Mega 寬版盤面需要更寬的遊玩空間': 'Mega wide reels need more horizontal space',
  系統維護升級公告: 'System maintenance and upgrade notice',
  '新遊戲 JetX3 震撼上架': 'New game JetX3 is now live',
  每週倍率王活動開跑: 'Weekly Multiplier King event is live',
  '理性遊戲，量力而為': 'Responsible gaming reminder: play responsibly',
  '歡迎回來，登入後立即進入遊戲大廳。': 'Welcome back. Log in to enter the lobby.',
  遊戲大廳: 'Lobby',
  會員錢包: 'Member Wallet',
  投注紀錄: 'Bet Records',
  '請先登入會員，登入完成後會回到剛才的遊戲頁面繼續操作。':
    'Log in first. After login, you will return to the game page.',
};

const LEGACY_THAI_TEXT: Record<string, string> = {
  公告: 'ประกาศ',
  優惠: 'โปรโมชัน',
  熱門: 'ยอดนิยม',
  熱門遊戲: 'เกมยอดนิยม',
  飛行: 'บิน',
  牌桌: 'โต๊ะ',
  拉霸: 'สล็อต',
  輪盤: 'รูเล็ต',
  即開: 'ทันใจ',
  策略: 'กลยุทธ์',
  大廳: 'ล็อบบี้',
  記錄: 'รายการ',
  彩金: 'แจ็กพอต',
  無上限: 'ไม่จำกัด',
  倍數符號: 'สัญลักษณ์ตัวคูณ',
  符號: 'สัญลักษณ์',
  霓虹熱線: 'Hotline',
  '霓虹燈牌、電光符號與左右雙向固定線派彩。':
    'ป้ายไฟนีออน สัญลักษณ์ไฟฟ้า และไลน์จ่ายคงที่จากซ้ายหรือขวา',
  待機中: 'สแตนด์บาย',
  轉軸加速中: 'วงล้อกำลังเร่ง',
  加速: 'เร็ว',
  賠率表: 'ตารางจ่าย',
  待觸發: 'รอทริกเกอร์',
  免費旋轉: 'ฟรีสปิน',
  免費旋轉中: 'กำลังฟรีสปิน',
  請將手機轉為橫向: 'โปรดหมุนมือถือเป็นแนวนอน',
  'Mega 寬版盤面需要更寬的遊玩空間': 'กระดาน Mega แบบกว้างต้องใช้พื้นที่แนวนอนมากขึ้น',
  系統維護升級公告: 'ประกาศปิดปรับปรุงและอัปเกรดระบบ',
  '新遊戲 JetX3 震撼上架': 'เกมใหม่ JetX3 เปิดให้เล่นแล้ว',
  每週倍率王活動開跑: 'กิจกรรมราชันตัวคูณประจำสัปดาห์เริ่มแล้ว',
  '理性遊戲，量力而為': 'เล่นอย่างมีสติและรับผิดชอบ',
  '歡迎回來，登入後立即進入遊戲大廳。': 'ยินดีต้อนรับกลับ เข้าสู่ระบบเพื่อเข้าล็อบบี้เกมทันที',
  '登入會員帳號後，可以選擇喜歡的館別與遊戲，查看餘額、投注紀錄與每局結果，繼續你的娛樂體驗。':
    'หลังเข้าสู่ระบบสมาชิก คุณสามารถเลือกห้องและเกมที่ชอบ ดูยอดคงเหลือ ประวัติเดิมพัน และผลแต่ละรอบ แล้วเล่นต่อได้ทันที',
  遊戲大廳: 'ล็อบบี้เกม',
  會員錢包: 'กระเป๋าสมาชิก',
  投注紀錄: 'ประวัติเดิมพัน',
  '請先登入會員，登入完成後會回到剛才的遊戲頁面繼續操作。':
    'โปรดเข้าสู่ระบบสมาชิกก่อน หลังเข้าสู่ระบบแล้วจะกลับไปยังหน้าเกมเดิมเพื่อทำต่อ',
  修改密碼: 'เปลี่ยนรหัสผ่าน',
  關閉修改密碼: 'ปิดการเปลี่ยนรหัสผ่าน',
  關閉帳號選單: 'ปิดเมนูบัญชี',
  關閉: 'ปิด',
  目前密碼: 'รหัสผ่านปัจจุบัน',
  新密碼: 'รหัสผ่านใหม่',
  確認新密碼: 'ยืนยันรหัสผ่านใหม่',
  '更新中...': 'กำลังอัปเดต...',
  更新密碼: 'อัปเดตรหัสผ่าน',
  '新密碼需為 8-128 碼，且包含英文與數字':
    'รหัสผ่านใหม่ต้องมี 8-128 ตัวอักษร และมีตัวอักษรกับตัวเลข',
  兩次輸入的新密碼不一致: 'รหัสผ่านใหม่สองครั้งไม่ตรงกัน',
  新密碼不能與目前密碼相同: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน',
  密碼已更新: 'อัปเดตรหัสผ่านแล้ว',
  本遊戲單注限紅: 'ขีดจำกัดเดิมพันเดี่ยวของเกมนี้',
  限紅: 'ขีดจำกัด',
  萌娃十點半: 'Dolly 10.5',
  兔糖十點半: 'Bunny 10.5',
  星願十點半: 'Starlit 10.5',
  龍門推筒: 'Dragon Tongzi',
  醒獅推筒: 'Lion Tongzi',
  玉兔推索: 'Jade Suozi',
  霓虹推索: 'Neon Suozi',
  金殿推萬: 'Golden Wanzi',
  天九黑粒: 'Tin Kau Black Dot',
  御殿黑粒: 'Royal Black Dot',
  街頭黑粒: 'Street Black Dot',
  影武黑粒: 'Shadow Black Dot',
  金礦黑粒: 'Golden Black Dot',
  王牌比大小: 'Card War',
  '可愛娃娃牌桌 · JQK 半點 · 接近 10.5 不爆即勝':
    'โต๊ะ Dolly · JQK ครึ่งแต้ม · ใกล้ 10.5 โดยไม่เกินจึงชนะ',
  '糖果系半點牌桌 · 滿點與五張未爆特別高亮': 'โต๊ะลูกกวาด 10.5 · ไฮไลต์แต้มเต็มและไพ่ 5 ใบไม่บัสต์',
  '星光娃娃半點牌桌 · 莊家補到大於閒家或爆牌':
    'โต๊ะ Starlit 10.5 · เจ้ามือจั่วจนมากกว่าผู้เล่นหรือบัสต์',
  '筒子牌型比點 · 白板對、對子、二八槓、點數': 'เทียบแต้มไพ่ Tongzi · คู่ขาว คู่ เอ้อปากัง และแต้ม',
  '醒獅金鼓風格 · 莊閒各兩張，即開比牌':
    'ธีมเชิดสิงโต · เจ้ามือและผู้เล่นได้ฝ่ายละ 2 ใบ เปิดแล้วเทียบทันที',
  '玉石仙境風格 · 索子與白板牌型高亮': 'ธีมหยกแฟนตาซี · ไฮไลต์ Suozi และไพ่ขาว',
  '夜市霓虹風格 · 快速翻索比點': 'ธีมตลาดกลางคืนนีออน · พลิก Suozi เทียบแต้มเร็ว',
  '金殿萬子牌桌 · 特殊牌型加強展示': 'โต๊ะ Wanzi วังทอง · แสดงไพ่พิเศษเด่นขึ้น',
  '天九牌四張兩墩 · 高低兩墩皆勝才贏': 'ไพ่ Tin Kau 4 ใบ แยก 2 กอง · ต้องชนะทั้งกองสูงและกองต่ำ',
  '御殿風格黑粒仔 · 對子大於點數': 'Black Dot ธีมวัง · คู่ใหญ่กว่าแต้ม',
  '街頭風格天九牌 · 平點莊吃': 'Tin Kau สไตล์สตรีท · แต้มเสมอเจ้ามือกิน',
  '影武主題黑粒仔 · 四張分墩公比': 'Black Dot ธีมนินจา · แยก 4 ใบเป็นกองเพื่อเทียบ',
  '金礦風格天九牌 · 至尊寶最大對': 'Tin Kau ธีมเหมืองทอง · Gee Joon เป็นคู่สูงสุด',
  '撲克牌單張比大小 · A 最大 · 平手退回本金':
    'ไพ่ใบเดียวเทียบสูงต่ำ · A สูงสุด · เสมอคืนเงินเดิมพัน',
  甜心娃娃: 'ดีลเลอร์ Dolly',
  糖心娃娃: 'ดีลเลอร์ Bunny',
  星願娃娃: 'ดีลเลอร์ Starlit',
  龍門牌官: 'ดีลเลอร์ Dragon',
  醒獅牌官: 'ดีลเลอร์ Lion',
  玉兔牌官: 'ดีลเลอร์ Jade',
  霓虹牌官: 'ดีลเลอร์ Neon',
  金殿牌官: 'ดีลเลอร์ Golden',
  天九牌官: 'ดีลเลอร์ Tin Kau',
  御殿牌官: 'ดีลเลอร์ Royal',
  街頭牌官: 'ดีลเลอร์ Street',
  影武牌官: 'ดีลเลอร์ Shadow',
  金礦牌官: 'ดีลเลอร์ Gold Mine',
  王牌荷官: 'ดีลเลอร์ Card War',
  處理中: 'กำลังดำเนินการ',
  開牌中: 'กำลังเปิดไพ่',
  玩家回合: 'ตาผู้เล่น',
  已結算: 'สรุปผลแล้ว',
  等待發牌: 'รอแจกไพ่',
  等待入局: 'รอเข้าเกม',
  等待開牌: 'รอเปิดไพ่',
  派彩倍率: 'ตัวคูณรางวัล',
  本局盈虧: 'กำไร/ขาดทุนรอบนี้',
  '下注後先發一張牌，請選擇補牌或停牌。': 'หลังเดิมพันจะแจกไพ่หนึ่งใบ เลือกจั่วหรือหยุด',
  '下注後立即開牌，結果會顯示在這裡。': 'หลังเดิมพันจะเปิดไพ่ทันที ผลจะแสดงที่นี่',
  補牌: 'จั่วไพ่',
  停牌: 'หยุดไพ่',
  開牌: 'เปิดไพ่',
  牌局進行中: 'กำลังเล่น',
  下一局發牌: 'แจกไพ่รอบถัดไป',
  下注發牌: 'เดิมพันและแจกไพ่',
  下一局入局: 'เข้ารอบถัดไป',
  下注入局: 'เดิมพันเข้าเกม',
  下注開牌: 'เดิมพันเปิดไพ่',
  '玩家已停牌，莊家會依規則一張一張補牌，補完後才結算。':
    'ผู้เล่นหยุดแล้ว เจ้ามือจะจั่วตามกติกาทีละใบแล้วค่อยสรุปผล',
  '4 點以下必須補牌，補到可停牌區間後才能停牌。':
    'ต่ำกว่า 4 แต้มต้องจั่ว จั่วจนถึงช่วงที่หยุดได้ก่อน',
  '8 點以上必須停牌，接著進入莊家補牌。': '8 แต้มขึ้นไปต้องหยุด จากนั้นเข้าเจ้ามือจั่ว',
  '可選擇補牌或停牌；超過 10 點半爆牌，平點莊家勝。':
    'เลือกจั่วหรือหยุดได้ เกิน 10.5 คือบัสต์ แต้มเสมอเจ้ามือชนะ',
  玩家擺牌: 'ผู้เล่นจัดไพ่',
  翻閒家第一張: 'เปิดใบแรกของผู้เล่น',
  翻閒家第二張: 'เปิดใบที่สองของผู้เล่น',
  等待翻牌: 'รอพลิกไพ่',
  等待開第二張: 'รอเปิดใบที่สอง',
  等待開閒家牌: 'รอเปิดไพ่ผู้เล่น',
  等待開莊家牌: 'รอเปิดไพ่เจ้ามือ',
  '請選一組高低墩；高低兩墩都大於莊家才算勝。': 'เลือกชุดกองสูง/ต่ำ ต้องชนะเจ้ามือทั้งสองกองจึงชนะ',
  '莊家已亮牌，請點閒家任一張蓋牌。': 'เจ้ามือเปิดแล้ว โปรดแตะไพ่คว่ำของผู้เล่นหนึ่งใบ',
  '第一張已開，請點另一張蓋牌比牌。': 'เปิดใบแรกแล้ว โปรดแตะไพ่อีกใบเพื่อเทียบ',
  請依序翻牌: 'โปรดพลิกไพ่ตามลำดับ',
  '開第二張後立即依牌型與點數結算。': 'เปิดใบที่สองแล้วสรุปตามรูปไพ่และแต้มทันที',
  '先開閒家牌，再開莊家牌比大小。': 'เปิดไพ่ผู้เล่นก่อน แล้วเปิดไพ่เจ้ามือเพื่อเทียบ',
  '閒家牌已開，開莊家牌後立即結算。': 'ไพ่ผู้เล่นเปิดแล้ว เปิดไพ่เจ้ามือแล้วสรุปทันที',
  牌局已結算: 'รอบไพ่สรุปผลแล้ว',
  '下注後莊家兩張先亮，閒家兩張蓋牌由玩家點選翻開。':
    'หลังเดิมพัน เจ้ามือเปิด 2 ใบก่อน ผู้เล่นแตะเปิดไพ่คว่ำ 2 ใบ',
  '下注後取得四張天九牌，請自行選擇高低兩墩。':
    'หลังเดิมพันจะได้ไพ่ Tin Kau 4 ใบ โปรดเลือกกองสูงและกองต่ำ',
  '下注後先開閒家牌，再開莊家牌比大小。':
    'หลังเดิมพันเปิดไพ่ผู้เล่นก่อน แล้วเปิดเจ้ามือเพื่อเทียบสูงต่ำ',
  莊家蓋牌: 'ไพ่คว่ำเจ้ามือ',
  點莊家牌開牌: 'แตะไพ่เจ้ามือเพื่อเปิด',
  閒家蓋牌: 'ไพ่คว่ำผู้เล่น',
  點閒家牌開牌: 'แตะไพ่ผู้เล่นเพื่อเปิด',
  下注後可翻牌: 'เดิมพันแล้วเปิดไพ่ได้',
  下注後點牌: 'เดิมพันแล้วแตะไพ่',
  點擊翻牌: 'แตะเพื่อเปิด',
  待翻: 'รอเปิด',
  待翻牌: 'รอเปิดไพ่',
  下注後先亮牌: 'เดิมพันแล้วเปิดไพ่ก่อน',
  玩家點牌翻開: 'ผู้เล่นแตะไพ่เพื่อเปิด',
  暗牌待開: 'ไพ่คว่ำรอเปิด',
  莊家暗牌: 'ไพ่คว่ำเจ้ามือ',
  閒家四張: 'ผู้เล่น 4 ใบ',
  莊家最佳擺牌: 'เจ้ามือจัดไพ่ดีที่สุด',
  擺牌後開牌: 'จัดไพ่แล้วเปิด',
  下注後發牌: 'เดิมพันแล้วแจกไพ่',
  '點選一組擺牌：上排高墩、下排低墩，莊家開牌後比兩墩。':
    'แตะเลือกชุดจัดไพ่: แถวบนกองสูง แถวล่างกองต่ำ แล้วเทียบสองกองหลังเจ้ามือเปิด',
  高墩: 'กองสูง',
  低墩: 'กองต่ำ',
  待開: 'รอเปิด',
  單張高牌: 'ไพ่สูงใบเดียว',
  半點牌: 'ไพ่ครึ่งแต้ม',
  莊家牌: 'ไพ่เจ้ามือ',
  特別勝型: 'รูปแบบชนะพิเศษ',
  爆牌: 'บัสต์',
  莊家點數: 'แต้มเจ้ามือ',
  玩家點數: 'แต้มผู้เล่น',
  請先下注: 'โปรดเดิมพันก่อน',
  關閉彈珠結算畫面: 'ปิดหน้าสรุป Plinko',
  關閉贏分畫面: 'ปิดหน้าชนะ',
  我的注單: 'เดิมพันของฉัน',
  自動投注完成: 'เดิมพันอัตโนมัติเสร็จสิ้น',
  投注金額超出限制: 'จำนวนเดิมพันเกินขีดจำกัด',
  達到單注上限: 'ถึงขีดจำกัดเดิมพันต่อครั้ง',
  '餘額不足，已停止': 'ยอดคงเหลือไม่พอ หยุดแล้ว',
  '下注失敗，已停止': 'เดิมพันไม่สำเร็จ หยุดแล้ว',
  達到停利: 'ถึงเป้าหมายทำกำไร',
  達到停損: 'ถึงขีดจำกัดหยุดขาดทุน',
  '自動投注設定不完整。': 'การตั้งค่าเดิมพันอัตโนมัติยังไม่ครบ',
  手動停止: 'หยุดด้วยตนเอง',
  停止自動投注: 'หยุดเดิมพันอัตโนมัติ',
  自動投注設定: 'ตั้งค่าเดิมพันอัตโนมัติ',
  停止自動: 'หยุดอัตโนมัติ',
  自動投注: 'เดิมพันอัตโนมัติ',
  開始自動投注: 'เริ่มเดิมพันอัตโนมัติ',
  '請先選號或使用自動挑選。': 'โปรดเลือกหมายเลขหรือใช้สุ่มเลือกก่อน',
  簡單: 'ง่าย',
  普通: 'ปกติ',
  困難: 'ยาก',
  瘋狂: 'สุดขีด',
  路線上限: 'ถึงขีดจำกัดเส้นทาง',
  餘額不足: 'ยอดคงเหลือไม่พอ',
  闖關失敗: 'ผ่านด่านไม่สำเร็จ',
  成功領取: 'รับสำเร็จ',
  小雞過馬路遊戲: 'เกม Chicken Road',
  投注模式: 'โหมดเดิมพัน',
  過馬路進度: 'ความคืบหน้าข้ามถนน',
  目前倍率: 'ตัวคูณปัจจุบัน',
  下一步: 'ก้าวถัดไป',
  可領取: 'รับได้',
  已通過: 'ผ่านแล้ว',
  正在準備高畫質遊戲畫面: 'กำลังเตรียมภาพเกมคุณภาพสูง',
  正在重新建立高畫質遊戲畫面: 'กำลังสร้างภาพเกมคุณภาพสูงใหม่',
  正在配合螢幕方向重新建立遊戲畫面: 'กำลังสร้างภาพเกมใหม่ตามทิศทางหน้าจอ',
  '免費遊戲恢復失敗，請重新整理後再試': 'กู้คืนฟรีเกมไม่สำเร็จ โปรดรีเฟรชแล้วลองอีกครั้ง',
  '餘額不足，無法購買免費遊戲': 'ยอดคงเหลือไม่พอ ไม่สามารถซื้อฟรีเกมได้',
  '遊戲畫面載入中，請稍候': 'กำลังโหลดภาพเกม โปรดรอสักครู่',
  '餘額不足，無法啟動自動轉動': 'ยอดคงเหลือไม่พอ ไม่สามารถเริ่มหมุนอัตโนมัติ',
  自動轉動中斷: 'การหมุนอัตโนมัติหยุดชะงัก',
  自動轉動完成: 'หมุนอัตโนมัติเสร็จสิ้น',
  任意中獎: 'ชนะใดๆ',
  免費遊戲: 'ฟรีเกม',
  單局派彩達標: 'รางวัลรอบเดียวถึงเป้าหมาย',
  停利達標: 'ถึงเป้าหมายทำกำไร',
  停損達標: 'ถึงเป้าหมายหยุดขาดทุน',
  本局贏分: 'ชนะรอบนี้',
  翻轉獎金: 'รางวัลพลิก',
  已完成: 'เสร็จสิ้น',
  '已觸發，準備進入免費旋轉': 'ทริกเกอร์แล้ว กำลังเข้าสู่ฟรีสปิน',
  '4 SCATTER 觸發': 'ทริกเกอร์ด้วย 4 SCATTER',
  載入中: 'กำลังโหลด',
  轉動中: 'กำลังหมุน',
  請稍候: 'โปรดรอ',
  點擊轉動: 'แตะเพื่อหมุน',
  停止中: 'กำลังหยุด',
  設定: 'ตั้งค่า',
  開啟: 'เปิด',
  一般: 'ปกติ',
  恭喜爆分: 'ชนะใหญ่',
  恭喜中獎: 'ยินดีด้วย คุณชนะ',
  小中獎派彩: 'รางวัลเล็ก',
  本局未中: 'รอบนี้ไม่ชนะ',
  封頂: 'ถึงเพดาน',
  登入查看: 'เข้าสู่ระบบเพื่อดู',
  關閉加速轉動: 'ปิดการหมุนเร็ว',
  開啟加速轉動: 'เปิดการหมุนเร็ว',
  停止自動轉動: 'หยุดหมุนอัตโนมัติ',
  設定自動轉動: 'ตั้งค่าหมุนอัตโนมัติ',
  購買免費遊戲: 'ซื้อฟรีเกม',
  下注金額: 'จำนวนเดิมพัน',
  關閉大獎畫面: 'ปิดหน้าชนะใหญ่',
  '8+ 連線觸發派彩': '8+ การเชื่อมต่อเพื่อจ่ายรางวัล',
  連線越多倍率越高: 'ยิ่งเชื่อมต่อมาก ตัวคูณยิ่งสูง',
  小派彩: 'รางวัลเล็ก',
  高派彩: 'รางวัลสูง',
  追加免費旋轉: 'เพิ่มฟรีสปิน',
  免費旋轉已觸發: 'ทริกเกอร์ฟรีสปินแล้ว',
  接下來轉動不扣下注: 'สปินต่อไปไม่หักเดิมพัน',
  '8+ 連線': '8+ การเชื่อมต่อ',
  '3 個': '3 อัน',
  購買免費: 'ซื้อฟรี',
  倍數啟動: 'เปิดใช้ตัวคูณ',
  本輪消除贏分套用倍數: 'ใช้ตัวคูณกับรางวัลการลบในรอบนี้',
  遊戲說明: 'คู่มือเกม',
  優惠活動: 'โปรโมชัน',
  遊戲紀錄: 'ประวัติเกม',
  最高爆分: 'ชนะสูงสุด',
  最近注單: 'เดิมพันล่าสุด',
  '尚無記錄，先下一注開局。': 'ยังไม่มีรายการ ลองเดิมพันเพื่อเริ่มรอบ',
  時間: 'เวลา',
  下注: 'เดิมพัน',
  倍率: 'ตัวคูณ',
  派彩: 'รางวัล',
  贏: 'ชนะ',
  輸: 'แพ้',
  今日: 'วันนี้',
  昨日: 'เมื่อวาน',
  本週: 'สัปดาห์นี้',
  上週: 'สัปดาห์ที่แล้ว',
  本月: 'เดือนนี้',
  每頁: 'ต่อหน้า',
  上一頁: 'หน้าก่อน',
  下一頁: 'หน้าถัดไป',
  查看開獎: 'ดูผลรางวัล',
  開獎詳情: 'รายละเอียดผลรางวัล',
  正在載入開獎結果: 'กำลังโหลดผลรางวัล',
  開獎結果: 'ผลรางวัล',
  驗證資料: 'ข้อมูลตรวจสอบ',
  '這筆注單沒有額外開獎資料。': 'เดิมพันนี้ไม่มีข้อมูลผลรางวัลเพิ่มเติม',
  局號: 'เลขรอบ',
  狀態: 'สถานะ',
  下注時間: 'เวลาเดิมพัน',
  結算時間: 'เวลาสรุปผล',
  結果: 'ผลลัพธ์',
  命中: 'ถูก',
  未命中: 'ไม่ถูก',
  本次翻牌安全: 'การเปิดครั้งนี้ปลอดภัย',
  已成功收分: 'รับรางวัลสำเร็จ',
  已成功領取獎金: 'รับรางวัลสำเร็จ',
  本局仍在進行中: 'รอบนี้ยังดำเนินอยู่',
  本局未中獎: 'รอบนี้ไม่ชนะ',
  擲出點數: 'แต้มที่ออก',
  目標值: 'ค่าเป้าหมาย',
  方向: 'ทิศทาง',
  中獎機率: 'โอกาสชนะ',
  開獎號碼: 'หมายเลขที่ออก',
  選擇號碼: 'หมายเลขที่เลือก',
  命中號碼: 'หมายเลขที่ถูก',
  命中數: 'จำนวนที่ถูก',
  風險: 'ความเสี่ยง',
  落點段位: 'ช่องที่ตก',
  段數: 'จำนวนช่อง',
  倍率表: 'ตารางตัวคูณ',
  開獎格: 'ช่องผลลัพธ์',
  下注內容: 'รายละเอียดเดิมพัน',
  中獎項目: 'รายการชนะ',
  盤面: 'กระดาน',
  中獎線: 'ไลน์ชนะ',
  掉落路徑: 'เส้นทางตก',
  落點槽: 'ช่องปลายทาง',
  列數: 'จำนวนแถว',
  地雷數: 'จำนวนระเบิด',
  地雷位置: 'ตำแหน่งระเบิด',
  已翻位置: 'ตำแหน่งที่เปิดแล้ว',
  是否踩雷: 'โดนระเบิดหรือไม่',
  踩雷格: 'ช่องที่โดนระเบิด',
  是否收分: 'รับรางวัลแล้วหรือไม่',
  牌序: 'ลำดับไพ่',
  最後選擇: 'ตัวเลือกสุดท้าย',
  是否正確: 'ถูกต้องหรือไม่',
  莊家手牌: 'ไพ่เจ้ามือ',
  閒家牌: 'ไพ่ผู้เล่น',
  龍牌: 'ไพ่มังกร',
  虎牌: 'ไพ่เสือ',
  總派彩: 'รางวัลรวม',
  規則: 'กติกา',
  來源: 'แหล่งที่มา',
  牌局結果: 'ผลไพ่',
  爆點: 'จุด Crash',
  自動收分: 'รับอัตโนมัติ',
  收分倍率: 'ตัวคูณรับรางวัล',
  本局結果: 'ผลรอบนี้',
  轉輪結果: 'ผลวงล้อ',
  掉落結果: 'ผลการตก',
  特殊紀錄: 'บันทึกพิเศษ',
  命中結果: 'ผลการถูก',
  爬階梯結果: 'ผลบันได',
  過馬路結果: 'ผลข้ามถนน',
  輪盤結果: 'ผลรูเล็ต',
  選擇路徑: 'เส้นทางที่เลือก',
  '本局沒有形成中獎線。': 'รอบนี้ไม่มีไลน์ชนะ',
  閒家: 'ผู้เล่น',
  莊家: 'เจ้ามือ',
  龍: 'มังกร',
  虎: 'เสือ',
  是: 'ใช่',
  否: 'ไม่',
  大於: 'มากกว่า',
  小於: 'น้อยกว่า',
  左: 'ซ้าย',
  右: 'ขวา',
  低: 'ต่ำ',
  中: 'กลาง',
  高: 'สูง',
  中等: 'ปานกลาง',
  專家: 'ผู้เชี่ยวชาญ',
  大師: 'มาสเตอร์',
  上排: 'แถวบน',
  中排: 'แถวกลาง',
  下排: 'แถวล่าง',
  上排線: 'ไลน์บน',
  中排線: 'ไลน์กลาง',
  下排線: 'ไลน์ล่าง',
  'V 型下折線': 'ไลน์ V ลง',
  'V 型上折線': 'ไลน์ V ขึ้น',
  左上到右下斜線: 'เส้นทแยงซ้ายบนไปขวาล่าง',
  左下到右上斜線: 'เส้นทแยงซ้ายล่างไปขวาบน',
  由右至左: 'ขวาไปซ้าย',
  由左至右: 'ซ้ายไปขวา',
  櫻桃: 'เชอร์รี่',
  金鈴: 'กระดิ่งทอง',
  七號: 'เลขเจ็ด',
  寶石: 'อัญมณี',
  頭獎: 'แจ็กพอต',
  黃寶石: 'อัญมณีเหลือง',
  綠寶石: 'อัญมณีเขียว',
  藍寶石: 'อัญมณีน้ำเงิน',
  骰子自動投注: 'เดิมพันลูกเต๋าอัตโนมัติ',
  自動下注設定: 'ตั้งค่าเดิมพันอัตโนมัติ',
  投注次數: 'จำนวนครั้งเดิมพัน',
  投注數量: 'จำนวนเดิมพัน',
  每注金額: 'จำนวนต่อเดิมพัน',
  單注上限: 'เดิมพันสูงสุดต่อครั้ง',
  停利金額: 'ยอดหยุดกำไร',
  停損金額: 'ยอดหยุดขาดทุน',
  贏局後: 'หลังชนะ',
  輸局後: 'หลังแพ้',
  重設: 'รีเซ็ต',
  加注: 'เพิ่มเดิมพัน',
  '增加 %': 'เพิ่ม %',
  快速動畫: 'แอนิเมชันเร็ว',
  設定預覽: 'พรีวิวการตั้งค่า',
  開始自動: 'เริ่มอัตโนมัติ',
  已投注: 'เดิมพันแล้ว',
  '贏 / 輸': 'ชนะ / แพ้',
  淨利: 'กำไรสุทธิ',
  目前注額: 'เดิมพันปัจจุบัน',
  基諾自動投注: 'เดิมพัน Keno อัตโนมัติ',
  掛機設定: 'ตั้งค่าอัตโนมัติ',
  每局重新自動挑選: 'สุ่มเลือกใหม่ทุกเกม',
  快速開獎: 'ออกรางวัลเร็ว',
  開始掛機: 'เริ่มอัตโนมัติ',
  點擊數: 'จำนวนที่ถูก',
  最近命中: 'ถูกล่าสุด',
  基諾掛機: 'Keno อัตโนมัติ',
  爬階梯: 'บันได',
  '請先下注並開始本局，再點擊塔格。': 'โปรดเดิมพันและเริ่มรอบก่อน แล้วค่อยแตะช่องหอคอย',
  手動投注: 'เดิมพันเอง',
  難度: 'ความยาก',
  投注: 'เดิมพัน',
  跳下一格: 'ไปช่องถัดไป',
  領取: 'รับ',
  再來一局: 'อีกรอบ',
  小雞過馬路: 'Chicken Road',
  玩法邏輯: 'หลักการเล่น',
  '每前進一格，倍率依難度提升，道路會持續往右延伸。':
    'ทุกช่องที่เดินหน้า ตัวคูณจะเพิ่มตามความยาก และถนนจะต่อไปทางขวา',
  '玩家可隨時領取；若進入車流命中區，本局本金歸零。':
    'ผู้เล่นรับรางวัลได้ทุกเวลา หากเข้าเขตรถชน เงินเดิมพันรอบนี้จะเป็นศูนย์',
  '路段最長 500 格，玩法核心是撐越遠倍率越高，直到命中車流或自行領取。':
    'เส้นทางยาวสุด 500 ช่อง ยิ่งไปไกลตัวคูณยิ่งสูง จนกว่าจะถูกรถหรือรับเอง',
};

const LEGACY_VIETNAMESE_TEXT: Record<string, string> = {
  公告: 'Thông báo',
  優惠: 'Khuyến mãi',
  熱門: 'Hot',
  熱門遊戲: 'Game hot',
  飛行: 'Bay',
  牌桌: 'Bàn',
  拉霸: 'Slot',
  輪盤: 'Roulette',
  即開: 'Tức thì',
  策略: 'Chiến thuật',
  大廳: 'Sảnh',
  記錄: 'Hồ sơ',
  彩金: 'Jackpot',
  無上限: 'Không giới hạn',
  倍數符號: 'Biểu tượng hệ số',
  符號: 'Biểu tượng',
  霓虹熱線: 'Hotline',
  '霓虹燈牌、電光符號與左右雙向固定線派彩。':
    'Biển hiệu neon, biểu tượng điện tử và dòng trả thưởng cố định từ trái hoặc phải.',
  待機中: 'Đang chờ',
  轉軸加速中: 'Vòng quay đang tăng tốc',
  加速: 'Tăng tốc',
  賠率表: 'Bảng trả thưởng',
  待觸發: 'Chờ kích hoạt',
  免費旋轉: 'Vòng quay miễn phí',
  免費旋轉中: 'Đang quay miễn phí',
  請將手機轉為橫向: 'Vui lòng xoay điện thoại ngang',
  'Mega 寬版盤面需要更寬的遊玩空間': 'Bảng Mega rộng cần nhiều không gian ngang hơn',
  系統維護升級公告: 'Thông báo bảo trì và nâng cấp hệ thống',
  '新遊戲 JetX3 震撼上架': 'Trò chơi mới JetX3 đã ra mắt',
  每週倍率王活動開跑: 'Sự kiện Vua hệ số tuần đã mở',
  '理性遊戲，量力而為': 'Chơi có trách nhiệm và trong khả năng',
  '歡迎回來，登入後立即進入遊戲大廳。': 'Chào mừng trở lại. Đăng nhập để vào sảnh game ngay.',
  '登入會員帳號後，可以選擇喜歡的館別與遊戲，查看餘額、投注紀錄與每局結果，繼續你的娛樂體驗。':
    'Sau khi đăng nhập thành viên, bạn có thể chọn phòng và game yêu thích, xem số dư, lịch sử cược và kết quả từng ván để tiếp tục trải nghiệm.',
  遊戲大廳: 'Sảnh game',
  會員錢包: 'Ví thành viên',
  投注紀錄: 'Lịch sử cược',
  '請先登入會員，登入完成後會回到剛才的遊戲頁面繼續操作。':
    'Vui lòng đăng nhập thành viên trước. Sau khi đăng nhập, bạn sẽ quay lại trang game vừa rồi.',
  修改密碼: 'Đổi mật khẩu',
  關閉修改密碼: 'Đóng đổi mật khẩu',
  關閉帳號選單: 'Đóng menu tài khoản',
  關閉: 'Đóng',
  目前密碼: 'Mật khẩu hiện tại',
  新密碼: 'Mật khẩu mới',
  確認新密碼: 'Xác nhận mật khẩu mới',
  '更新中...': 'Đang cập nhật...',
  更新密碼: 'Cập nhật mật khẩu',
  '新密碼需為 8-128 碼，且包含英文與數字': 'Mật khẩu mới phải dài 8-128 ký tự và có chữ cùng số',
  兩次輸入的新密碼不一致: 'Hai mật khẩu mới không khớp',
  新密碼不能與目前密碼相同: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  密碼已更新: 'Mật khẩu đã được cập nhật',
  本遊戲單注限紅: 'Giới hạn cược đơn của game này',
  限紅: 'Giới hạn',
  萌娃十點半: 'Dolly 10.5',
  兔糖十點半: 'Bunny 10.5',
  星願十點半: 'Starlit 10.5',
  龍門推筒: 'Dragon Tongzi',
  醒獅推筒: 'Lion Tongzi',
  玉兔推索: 'Jade Suozi',
  霓虹推索: 'Neon Suozi',
  金殿推萬: 'Golden Wanzi',
  天九黑粒: 'Tin Kau Black Dot',
  御殿黑粒: 'Royal Black Dot',
  街頭黑粒: 'Street Black Dot',
  影武黑粒: 'Shadow Black Dot',
  金礦黑粒: 'Golden Black Dot',
  王牌比大小: 'Card War',
  '可愛娃娃牌桌 · JQK 半點 · 接近 10.5 不爆即勝':
    'Bàn Dolly · JQK tính nửa điểm · gần 10.5 mà không quá là thắng',
  '糖果系半點牌桌 · 滿點與五張未爆特別高亮': 'Bàn kẹo 10.5 · nổi bật đủ điểm và 5 lá không bể',
  '星光娃娃半點牌桌 · 莊家補到大於閒家或爆牌':
    'Bàn Starlit 10.5 · nhà cái rút đến khi lớn hơn người chơi hoặc bể',
  '筒子牌型比點 · 白板對、對子、二八槓、點數':
    'So điểm Tongzi · đôi trắng, đôi, nhị bát cống và điểm',
  '醒獅金鼓風格 · 莊閒各兩張，即開比牌':
    'Phong cách lân vàng · nhà cái và người chơi mỗi bên 2 lá, mở là so ngay',
  '玉石仙境風格 · 索子與白板牌型高亮': 'Phong cách tiên cảnh ngọc · nổi bật Suozi và bài trắng',
  '夜市霓虹風格 · 快速翻索比點': 'Phong cách chợ đêm neon · mở Suozi so điểm nhanh',
  '金殿萬子牌桌 · 特殊牌型加強展示': 'Bàn Wanzi cung vàng · hiển thị mạnh bài đặc biệt',
  '天九牌四張兩墩 · 高低兩墩皆勝才贏':
    'Tin Kau 4 quân chia 2 chi · phải thắng cả chi cao và chi thấp',
  '御殿風格黑粒仔 · 對子大於點數': 'Black Dot phong cách hoàng điện · đôi lớn hơn điểm',
  '街頭風格天九牌 · 平點莊吃': 'Tin Kau phong cách đường phố · đồng điểm nhà cái ăn',
  '影武主題黑粒仔 · 四張分墩公比': 'Black Dot chủ đề bóng đêm · 4 quân chia chi để so',
  '金礦風格天九牌 · 至尊寶最大對': 'Tin Kau mỏ vàng · Gee Joon là đôi lớn nhất',
  '撲克牌單張比大小 · A 最大 · 平手退回本金':
    'So lớn nhỏ một lá bài · A lớn nhất · hòa trả lại tiền cược',
  甜心娃娃: 'Dealer Dolly',
  糖心娃娃: 'Dealer Bunny',
  星願娃娃: 'Dealer Starlit',
  龍門牌官: 'Dealer Dragon',
  醒獅牌官: 'Dealer Lion',
  玉兔牌官: 'Dealer Jade',
  霓虹牌官: 'Dealer Neon',
  金殿牌官: 'Dealer Golden',
  天九牌官: 'Dealer Tin Kau',
  御殿牌官: 'Dealer Royal',
  街頭牌官: 'Dealer Street',
  影武牌官: 'Dealer Shadow',
  金礦牌官: 'Dealer Gold Mine',
  王牌荷官: 'Dealer Card War',
  處理中: 'Đang xử lý',
  開牌中: 'Đang mở bài',
  玩家回合: 'Lượt người chơi',
  已結算: 'Đã kết toán',
  等待發牌: 'Chờ chia bài',
  等待入局: 'Chờ vào ván',
  等待開牌: 'Chờ mở bài',
  派彩倍率: 'Hệ số trả thưởng',
  本局盈虧: 'Lãi/lỗ ván này',
  '下注後先發一張牌，請選擇補牌或停牌。': 'Sau khi cược sẽ chia một lá, hãy chọn rút hoặc dừng.',
  '下注後立即開牌，結果會顯示在這裡。': 'Sau khi cược sẽ mở bài ngay, kết quả hiển thị tại đây.',
  補牌: 'Rút bài',
  停牌: 'Dừng bài',
  開牌: 'Mở bài',
  牌局進行中: 'Ván đang diễn ra',
  下一局發牌: 'Chia bài ván sau',
  下注發牌: 'Cược và chia bài',
  下一局入局: 'Vào ván sau',
  下注入局: 'Cược vào ván',
  下注開牌: 'Cược mở bài',
  '玩家已停牌，莊家會依規則一張一張補牌，補完後才結算。':
    'Người chơi đã dừng, nhà cái sẽ rút từng lá theo luật rồi mới kết toán.',
  '4 點以下必須補牌，補到可停牌區間後才能停牌。':
    'Dưới 4 điểm bắt buộc rút, đến vùng có thể dừng mới được dừng.',
  '8 點以上必須停牌，接著進入莊家補牌。': 'Từ 8 điểm trở lên phải dừng, sau đó nhà cái rút bài.',
  '可選擇補牌或停牌；超過 10 點半爆牌，平點莊家勝。':
    'Có thể rút hoặc dừng; quá 10.5 là bể, đồng điểm nhà cái thắng.',
  玩家擺牌: 'Người chơi xếp bài',
  翻閒家第一張: 'Mở lá đầu của người chơi',
  翻閒家第二張: 'Mở lá thứ hai của người chơi',
  等待翻牌: 'Chờ lật bài',
  等待開第二張: 'Chờ mở lá thứ hai',
  等待開閒家牌: 'Chờ mở bài người chơi',
  等待開莊家牌: 'Chờ mở bài nhà cái',
  '請選一組高低墩；高低兩墩都大於莊家才算勝。':
    'Chọn một bộ chi cao/thấp; cả hai chi đều lớn hơn nhà cái mới thắng.',
  '莊家已亮牌，請點閒家任一張蓋牌。': 'Nhà cái đã mở, hãy chạm một lá úp của người chơi.',
  '第一張已開，請點另一張蓋牌比牌。': 'Lá đầu đã mở, hãy chạm lá úp còn lại để so bài.',
  請依序翻牌: 'Vui lòng lật bài theo thứ tự',
  '開第二張後立即依牌型與點數結算。': 'Mở lá thứ hai rồi kết toán ngay theo kiểu bài và điểm.',
  '先開閒家牌，再開莊家牌比大小。': 'Mở bài người chơi trước, rồi mở bài nhà cái để so lớn nhỏ.',
  '閒家牌已開，開莊家牌後立即結算。': 'Bài người chơi đã mở, mở bài nhà cái rồi kết toán ngay.',
  牌局已結算: 'Ván bài đã kết toán',
  '下注後莊家兩張先亮，閒家兩張蓋牌由玩家點選翻開。':
    'Sau cược, nhà cái mở 2 lá trước; người chơi chạm để mở 2 lá úp.',
  '下注後取得四張天九牌，請自行選擇高低兩墩。':
    'Sau cược nhận 4 quân Tin Kau, hãy tự chọn chi cao và chi thấp.',
  '下注後先開閒家牌，再開莊家牌比大小。':
    'Sau cược mở bài người chơi trước, rồi mở bài nhà cái để so lớn nhỏ.',
  莊家蓋牌: 'Bài úp nhà cái',
  點莊家牌開牌: 'Chạm bài nhà cái để mở',
  閒家蓋牌: 'Bài úp người chơi',
  點閒家牌開牌: 'Chạm bài người chơi để mở',
  下注後可翻牌: 'Cược xong có thể lật bài',
  下注後點牌: 'Cược xong chạm bài',
  點擊翻牌: 'Chạm để lật',
  待翻: 'Chờ lật',
  待翻牌: 'Chờ lật bài',
  下注後先亮牌: 'Cược xong mở bài trước',
  玩家點牌翻開: 'Người chơi chạm bài để mở',
  暗牌待開: 'Bài úp chờ mở',
  莊家暗牌: 'Bài úp nhà cái',
  閒家四張: 'Người chơi 4 quân',
  莊家最佳擺牌: 'Nhà cái xếp bài tối ưu',
  擺牌後開牌: 'Xếp bài rồi mở',
  下注後發牌: 'Cược xong chia bài',
  '點選一組擺牌：上排高墩、下排低墩，莊家開牌後比兩墩。':
    'Chạm một bộ xếp bài: hàng trên là chi cao, hàng dưới là chi thấp; nhà cái mở rồi so hai chi.',
  高墩: 'Chi cao',
  低墩: 'Chi thấp',
  待開: 'Chờ mở',
  單張高牌: 'Một lá bài cao',
  半點牌: 'Bài nửa điểm',
  莊家牌: 'Bài nhà cái',
  特別勝型: 'Kiểu thắng đặc biệt',
  爆牌: 'Bể bài',
  莊家點數: 'Điểm nhà cái',
  玩家點數: 'Điểm người chơi',
  請先下注: 'Vui lòng cược trước',
  關閉彈珠結算畫面: 'Đóng màn hình kết toán Plinko',
  關閉贏分畫面: 'Đóng màn hình thắng',
  我的注單: 'Phiếu cược của tôi',
  自動投注完成: 'Cược tự động hoàn tất',
  投注金額超出限制: 'Số tiền cược vượt giới hạn',
  達到單注上限: 'Đã đạt giới hạn cược đơn',
  '餘額不足，已停止': 'Số dư không đủ, đã dừng',
  '下注失敗，已停止': 'Cược thất bại, đã dừng',
  達到停利: 'Đã đạt chốt lời',
  達到停損: 'Đã đạt dừng lỗ',
  '自動投注設定不完整。': 'Cài đặt cược tự động chưa đầy đủ.',
  手動停止: 'Dừng thủ công',
  停止自動投注: 'Dừng cược tự động',
  自動投注設定: 'Cài đặt cược tự động',
  停止自動: 'Dừng tự động',
  自動投注: 'Cược tự động',
  開始自動投注: 'Bắt đầu cược tự động',
  '請先選號或使用自動挑選。': 'Vui lòng chọn số hoặc dùng chọn nhanh trước.',
  簡單: 'Dễ',
  普通: 'Thường',
  困難: 'Khó',
  瘋狂: 'Cực hạn',
  路線上限: 'Giới hạn tuyến đường',
  餘額不足: 'Số dư không đủ',
  闖關失敗: 'Vượt ải thất bại',
  成功領取: 'Nhận thành công',
  小雞過馬路遊戲: 'Game Chicken Road',
  投注模式: 'Chế độ cược',
  過馬路進度: 'Tiến độ qua đường',
  目前倍率: 'Hệ số hiện tại',
  下一步: 'Bước tiếp theo',
  可領取: 'Có thể nhận',
  已通過: 'Đã vượt qua',
  正在準備高畫質遊戲畫面: 'Đang chuẩn bị màn hình game chất lượng cao',
  正在重新建立高畫質遊戲畫面: 'Đang tạo lại màn hình game chất lượng cao',
  正在配合螢幕方向重新建立遊戲畫面: 'Đang tạo lại màn hình game theo hướng màn hình',
  '免費遊戲恢復失敗，請重新整理後再試':
    'Khôi phục free game thất bại, vui lòng làm mới rồi thử lại',
  '餘額不足，無法購買免費遊戲': 'Số dư không đủ, không thể mua free game',
  '遊戲畫面載入中，請稍候': 'Màn hình game đang tải, vui lòng chờ',
  '餘額不足，無法啟動自動轉動': 'Số dư không đủ, không thể bắt đầu quay tự động',
  自動轉動中斷: 'Quay tự động bị gián đoạn',
  自動轉動完成: 'Quay tự động hoàn tất',
  任意中獎: 'Bất kỳ thắng nào',
  免費遊戲: 'Free game',
  單局派彩達標: 'Trả thưởng một ván đạt mục tiêu',
  停利達標: 'Chốt lời đạt mục tiêu',
  停損達標: 'Dừng lỗ đạt mục tiêu',
  本局贏分: 'Thắng ván này',
  翻轉獎金: 'Tiền thưởng lật',
  已完成: 'Hoàn tất',
  '已觸發，準備進入免費旋轉': 'Đã kích hoạt, chuẩn bị vào vòng quay miễn phí',
  '4 SCATTER 觸發': 'Kích hoạt 4 SCATTER',
  載入中: 'Đang tải',
  轉動中: 'Đang quay',
  請稍候: 'Vui lòng chờ',
  點擊轉動: 'Nhấn để quay',
  停止中: 'Đang dừng',
  設定: 'Cài đặt',
  開啟: 'Bật',
  一般: 'Thường',
  恭喜爆分: 'Thắng lớn',
  恭喜中獎: 'Chúc mừng thắng',
  小中獎派彩: 'Trả thưởng nhỏ',
  本局未中: 'Ván này không trúng',
  封頂: 'Đạt trần',
  登入查看: 'Đăng nhập để xem',
  關閉加速轉動: 'Tắt quay nhanh',
  開啟加速轉動: 'Bật quay nhanh',
  停止自動轉動: 'Dừng quay tự động',
  設定自動轉動: 'Cài đặt quay tự động',
  購買免費遊戲: 'Mua free game',
  下注金額: 'Số tiền cược',
  關閉大獎畫面: 'Đóng màn hình thắng lớn',
  '8+ 連線觸發派彩': '8+ kết nối kích hoạt trả thưởng',
  連線越多倍率越高: 'Càng nhiều kết nối, hệ số càng cao',
  小派彩: 'Trả thưởng nhỏ',
  高派彩: 'Trả thưởng cao',
  追加免費旋轉: 'Thêm vòng quay miễn phí',
  免費旋轉已觸發: 'Đã kích hoạt vòng quay miễn phí',
  接下來轉動不扣下注: 'Các lượt quay tiếp theo không trừ cược',
  '8+ 連線': '8+ kết nối',
  '3 個': '3 biểu tượng',
  購買免費: 'Mua miễn phí',
  倍數啟動: 'Kích hoạt hệ số',
  本輪消除贏分套用倍數: 'Áp dụng hệ số cho thắng xóa ở vòng này',
  遊戲說明: 'Hướng dẫn game',
  優惠活動: 'Khuyến mãi',
  遊戲紀錄: 'Lịch sử game',
  最高爆分: 'Thắng cao nhất',
  最近注單: 'Cược gần đây',
  '尚無記錄，先下一注開局。': 'Chưa có hồ sơ, hãy đặt một cược để bắt đầu.',
  時間: 'Thời gian',
  下注: 'Cược',
  倍率: 'Hệ số',
  派彩: 'Trả thưởng',
  贏: 'Thắng',
  輸: 'Thua',
  今日: 'Hôm nay',
  昨日: 'Hôm qua',
  本週: 'Tuần này',
  上週: 'Tuần trước',
  本月: 'Tháng này',
  每頁: 'Mỗi trang',
  上一頁: 'Trang trước',
  下一頁: 'Trang sau',
  查看開獎: 'Xem kết quả',
  開獎詳情: 'Chi tiết kết quả',
  正在載入開獎結果: 'Đang tải kết quả',
  開獎結果: 'Kết quả mở thưởng',
  驗證資料: 'Dữ liệu xác minh',
  '這筆注單沒有額外開獎資料。': 'Phiếu cược này không có dữ liệu kết quả bổ sung.',
  局號: 'Mã ván',
  狀態: 'Trạng thái',
  下注時間: 'Thời gian cược',
  結算時間: 'Thời gian kết toán',
  結果: 'Kết quả',
  命中: 'Trúng',
  未命中: 'Không trúng',
  本次翻牌安全: 'Lần mở này an toàn',
  已成功收分: 'Đã rút thưởng thành công',
  已成功領取獎金: 'Đã nhận thưởng thành công',
  本局仍在進行中: 'Ván này vẫn đang diễn ra',
  本局未中獎: 'Ván này không trúng',
  擲出點數: 'Điểm tung ra',
  目標值: 'Giá trị mục tiêu',
  方向: 'Hướng',
  中獎機率: 'Xác suất thắng',
  開獎號碼: 'Số mở thưởng',
  選擇號碼: 'Số đã chọn',
  命中號碼: 'Số trúng',
  命中數: 'Số trúng',
  風險: 'Rủi ro',
  落點段位: 'Ô rơi',
  段數: 'Số ô',
  倍率表: 'Bảng hệ số',
  開獎格: 'Ô kết quả',
  下注內容: 'Nội dung cược',
  中獎項目: 'Mục thắng',
  盤面: 'Bảng',
  中獎線: 'Dòng thắng',
  掉落路徑: 'Đường rơi',
  落點槽: 'Ô cuối',
  列數: 'Số hàng',
  地雷數: 'Số mìn',
  地雷位置: 'Vị trí mìn',
  已翻位置: 'Vị trí đã mở',
  是否踩雷: 'Có trúng mìn không',
  踩雷格: 'Ô trúng mìn',
  是否收分: 'Đã rút thưởng chưa',
  牌序: 'Thứ tự bài',
  最後選擇: 'Lựa chọn cuối',
  是否正確: 'Có đúng không',
  莊家手牌: 'Bài nhà cái',
  閒家牌: 'Bài người chơi',
  龍牌: 'Bài Rồng',
  虎牌: 'Bài Hổ',
  總派彩: 'Tổng trả thưởng',
  規則: 'Luật',
  來源: 'Nguồn',
  牌局結果: 'Kết quả ván bài',
  爆點: 'Điểm crash',
  自動收分: 'Rút tự động',
  收分倍率: 'Hệ số rút thưởng',
  本局結果: 'Kết quả ván này',
  轉輪結果: 'Kết quả vòng quay',
  掉落結果: 'Kết quả rơi',
  特殊紀錄: 'Ghi nhận đặc biệt',
  命中結果: 'Kết quả trúng',
  爬階梯結果: 'Kết quả cầu thang',
  過馬路結果: 'Kết quả qua đường',
  輪盤結果: 'Kết quả roulette',
  選擇路徑: 'Đường đã chọn',
  '本局沒有形成中獎線。': 'Ván này không tạo dòng thắng.',
  閒家: 'Người chơi',
  莊家: 'Nhà cái',
  龍: 'Rồng',
  虎: 'Hổ',
  是: 'Có',
  否: 'Không',
  大於: 'Lớn hơn',
  小於: 'Nhỏ hơn',
  左: 'Trái',
  右: 'Phải',
  低: 'Thấp',
  中: 'Trung bình',
  高: 'Cao',
  中等: 'Vừa',
  專家: 'Chuyên gia',
  大師: 'Bậc thầy',
  上排: 'Hàng trên',
  中排: 'Hàng giữa',
  下排: 'Hàng dưới',
  上排線: 'Dòng trên',
  中排線: 'Dòng giữa',
  下排線: 'Dòng dưới',
  'V 型下折線': 'Dòng V xuống',
  'V 型上折線': 'Dòng V lên',
  左上到右下斜線: 'Chéo trái trên xuống phải dưới',
  左下到右上斜線: 'Chéo trái dưới lên phải trên',
  由右至左: 'Từ phải sang trái',
  由左至右: 'Từ trái sang phải',
  櫻桃: 'Anh đào',
  金鈴: 'Chuông vàng',
  七號: 'Số bảy',
  寶石: 'Đá quý',
  頭獎: 'Jackpot',
  黃寶石: 'Đá vàng',
  綠寶石: 'Đá xanh lá',
  藍寶石: 'Đá xanh dương',
  骰子自動投注: 'Cược Dice tự động',
  自動下注設定: 'Cài đặt cược tự động',
  投注次數: 'Số lượt cược',
  投注數量: 'Số lượt cược',
  每注金額: 'Số tiền mỗi cược',
  單注上限: 'Giới hạn cược đơn',
  停利金額: 'Số tiền chốt lời',
  停損金額: 'Số tiền dừng lỗ',
  贏局後: 'Sau khi thắng',
  輸局後: 'Sau khi thua',
  重設: 'Đặt lại',
  加注: 'Tăng cược',
  '增加 %': 'Tăng %',
  快速動畫: 'Hoạt ảnh nhanh',
  設定預覽: 'Xem trước cài đặt',
  開始自動: 'Bắt đầu tự động',
  已投注: 'Đã cược',
  '贏 / 輸': 'Thắng / Thua',
  淨利: 'Lãi ròng',
  目前注額: 'Cược hiện tại',
  基諾自動投注: 'Cược Keno tự động',
  掛機設定: 'Cài đặt tự động',
  每局重新自動挑選: 'Tự chọn lại mỗi ván',
  快速開獎: 'Quay số nhanh',
  開始掛機: 'Bắt đầu tự động',
  點擊數: 'Số trúng',
  最近命中: 'Trúng gần nhất',
  基諾掛機: 'Keno tự động',
  爬階梯: 'Cầu thang',
  '請先下注並開始本局，再點擊塔格。': 'Vui lòng cược và bắt đầu ván trước, rồi nhấn ô tháp.',
  手動投注: 'Cược thủ công',
  難度: 'Độ khó',
  投注: 'Cược',
  跳下一格: 'Nhảy ô tiếp theo',
  領取: 'Nhận',
  再來一局: 'Ván nữa',
  小雞過馬路: 'Chicken Road',
  玩法邏輯: 'Logic cách chơi',
  '每前進一格，倍率依難度提升，道路會持續往右延伸。':
    'Mỗi ô tiến lên sẽ tăng hệ số theo độ khó, và đường tiếp tục kéo sang phải.',
  '玩家可隨時領取；若進入車流命中區，本局本金歸零。':
    'Người chơi có thể nhận bất cứ lúc nào; nếu vào vùng xe đụng, tiền cược ván này về 0.',
  '路段最長 500 格，玩法核心是撐越遠倍率越高，直到命中車流或自行領取。':
    'Đường dài tối đa 500 ô; đi càng xa hệ số càng cao, cho đến khi bị xe đụng hoặc tự nhận.',
};

const textMaps: Partial<Record<Locale, Map<string, string>>> = {
  en: buildTextMap(en, LEGACY_ENGLISH_TEXT),
  th: buildTextMap(th, LEGACY_THAI_TEXT),
  vi: buildTextMap(vi, LEGACY_VIETNAMESE_TEXT),
};

export function installLegacyDomLocalizer(locale: Locale): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  let frameId = 0;
  const schedule = () => {
    if (frameId) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      localizeNode(document.body, locale);
    });
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [...TEXT_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    if (frameId) window.cancelAnimationFrame(frameId);
  };
}

function localizeNode(node: Node, locale: Locale): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = localizeText(node.textContent ?? '', locale);
    if (node.textContent !== next) node.textContent = next;
    return;
  }

  if (!(node instanceof HTMLElement)) return;

  for (const attr of TEXT_ATTRIBUTES) {
    const value = node.getAttribute(attr);
    if (!value) continue;
    const next = localizeText(value, locale);
    if (next !== value) node.setAttribute(attr, next);
  }

  if (SKIP_TEXT_TAGS.has(node.tagName)) return;

  node.childNodes.forEach((child) => localizeNode(child, locale));
}

function localizeText(value: string, locale: Locale): string {
  if (!value.trim()) return value;
  if (locale === 'zh-Hant') return value;
  if (locale === 'zh-Hans') return toSimplified(value);
  return localizeWithMap(value, locale);
}

function localizeWithMap(value: string, locale: Locale): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  const textMap = textMaps[locale];
  const translated = textMap?.get(core) ?? textMap?.get(toSimplified(core));
  if (translated) return `${leading}${translated}${trailing}`;
  const template = localizeTemplate(core, locale);
  return template ? `${leading}${template}${trailing}` : value;
}

function localizeTemplate(core: string, locale: Locale): string | null {
  const history = localizeHistoryTemplate(core, locale);
  if (history) return history;

  if (locale === 'th') {
    return (
      replace(
        core,
        /^(.+)\s+(\d+(?:\.\d+)?)點$/,
        (label, score) => `${localizeInline(locale, label)} ${score} แต้ม`,
      ) ??
      replace(
        core,
        /^(.+)\s+(\d+(?:\.\d+)?)點\s+勝(.+)\s+(\d+(?:\.\d+)?)點$/,
        (winner, winnerScore, loser, loserScore) =>
          `${localizeInline(locale, winner)} ${winnerScore} แต้ม ชนะ ${localizeInline(locale, loser)} ${loserScore} แต้ม`,
      ) ??
      replace(
        core,
        /^(.+)\s+同點，退回本金$/,
        (label) => `${localizeInline(locale, label)} แต้มเสมอ คืนเงินเดิมพัน`,
      ) ??
      replace(
        core,
        /^高墩\s+(.+)\s+\/\s+低墩\s+(.+)$/,
        (high, low) =>
          `กองสูง ${localizeInline(locale, high)} / กองต่ำ ${localizeInline(locale, low)}`,
      ) ??
      replace(core, /^高墩：(.+)$/, (value) => `กองสูง: ${localizeInline(locale, value)}`) ??
      replace(core, /^低墩：(.+)$/, (value) => `กองต่ำ: ${localizeInline(locale, value)}`) ??
      replace(
        core,
        /^低墩：(.+)\s+·\s+高墩：(.+)$/,
        (low, high) =>
          `กองต่ำ: ${localizeInline(locale, low)} · กองสูง: ${localizeInline(locale, high)}`,
      ) ??
      replace(core, /^高\s+(.+)$/, (value) => `สูง ${localizeInline(locale, value)}`) ??
      replace(core, /^低\s+(.+)$/, (value) => `ต่ำ ${localizeInline(locale, value)}`) ??
      replace(core, /^翻閒家第\s+(.+)\s+張$/, (index) => `เปิดไพ่ผู้เล่นใบที่ ${index}`) ??
      replace(core, /^莊家第\s+(.+)\s+張$/, (index) => `ไพ่เจ้ามือใบที่ ${index}`) ??
      replace(core, /^閒家第\s+(.+)\s+張$/, (index) => `ไพ่ผู้เล่นใบที่ ${index}`) ??
      replace(core, /^(.+)\s+張$/, (count) => `${count} ใบ`) ??
      replace(
        core,
        /^選擇高墩\s+(.+)\s+(.+)，低墩\s+(.+)\s+(.+)$/,
        (highRank, highScore, lowRank, lowScore) =>
          `เลือกกองสูง ${localizeInline(locale, highRank)} ${localizeInline(locale, highScore)} กองต่ำ ${localizeInline(locale, lowRank)} ${localizeInline(locale, lowScore)}`,
      ) ??
      replace(core, /^最高爆分\s+(.+)$/, (value) => `ชนะสูงสุด ${value}`) ??
      replace(core, /^剩\s+(.+)$/, (value) => `เหลือ ${value}`) ??
      replace(core, /^最低下注為\s+(.+)。$/, (value) => `เดิมพันขั้นต่ำคือ ${value}`) ??
      replace(core, /^單注上限為\s+(.+)。$/, (value) => `เดิมพันสูงสุดต่อครั้งคือ ${value}`) ??
      replace(core, /^(\d+)\/(\d+)\s+命中$/, (hits, total) => `ถูก ${hits}/${total}`) ??
      replace(
        core,
        /^(.+)\s+次\s+·\s+(.+)\s+\/\s+注\s+·\s+上限\s+(.+)$/,
        (rounds, amount, max) => `${rounds} ครั้ง · ${amount} / เดิมพัน · สูงสุด ${max}`,
      ) ??
      replace(
        core,
        /^(.+)\s+局\s+·\s+(.+)\s+號\s+·\s+(.+)$/,
        (rounds, count, amount) => `${rounds} รอบ · ${count} หมายเลข · ${amount}`,
      ) ??
      replace(core, /^第\s+(.+)\s+格$/, (step) => `ช่องที่ ${step}`) ??
      replace(core, /^(.+)\s+格$/, (step) => `${step} ช่อง`) ??
      replace(
        core,
        /^(.+)\s+層\s+·\s+(.+)$/,
        (level, difficulty) => `${level} ชั้น · ${difficulty}`,
      ) ??
      replace(core, /^通關\s+·\s+(.+)$/, (difficulty) => `ผ่านด่าน · ${difficulty}`)
    );
  }
  if (locale === 'vi') {
    return (
      replace(
        core,
        /^(.+)\s+(\d+(?:\.\d+)?)點$/,
        (label, score) => `${localizeInline(locale, label)} ${score} điểm`,
      ) ??
      replace(
        core,
        /^(.+)\s+(\d+(?:\.\d+)?)點\s+勝(.+)\s+(\d+(?:\.\d+)?)點$/,
        (winner, winnerScore, loser, loserScore) =>
          `${localizeInline(locale, winner)} ${winnerScore} điểm thắng ${localizeInline(locale, loser)} ${loserScore} điểm`,
      ) ??
      replace(
        core,
        /^(.+)\s+同點，退回本金$/,
        (label) => `${localizeInline(locale, label)} đồng điểm, hoàn tiền cược`,
      ) ??
      replace(
        core,
        /^高墩\s+(.+)\s+\/\s+低墩\s+(.+)$/,
        (high, low) =>
          `Chi cao ${localizeInline(locale, high)} / chi thấp ${localizeInline(locale, low)}`,
      ) ??
      replace(core, /^高墩：(.+)$/, (value) => `Chi cao: ${localizeInline(locale, value)}`) ??
      replace(core, /^低墩：(.+)$/, (value) => `Chi thấp: ${localizeInline(locale, value)}`) ??
      replace(
        core,
        /^低墩：(.+)\s+·\s+高墩：(.+)$/,
        (low, high) =>
          `Chi thấp: ${localizeInline(locale, low)} · chi cao: ${localizeInline(locale, high)}`,
      ) ??
      replace(core, /^高\s+(.+)$/, (value) => `Cao ${localizeInline(locale, value)}`) ??
      replace(core, /^低\s+(.+)$/, (value) => `Thấp ${localizeInline(locale, value)}`) ??
      replace(core, /^翻閒家第\s+(.+)\s+張$/, (index) => `Mở lá người chơi thứ ${index}`) ??
      replace(core, /^莊家第\s+(.+)\s+張$/, (index) => `Lá nhà cái thứ ${index}`) ??
      replace(core, /^閒家第\s+(.+)\s+張$/, (index) => `Lá người chơi thứ ${index}`) ??
      replace(core, /^(.+)\s+張$/, (count) => `${count} lá`) ??
      replace(
        core,
        /^選擇高墩\s+(.+)\s+(.+)，低墩\s+(.+)\s+(.+)$/,
        (highRank, highScore, lowRank, lowScore) =>
          `Chọn chi cao ${localizeInline(locale, highRank)} ${localizeInline(locale, highScore)}, chi thấp ${localizeInline(locale, lowRank)} ${localizeInline(locale, lowScore)}`,
      ) ??
      replace(core, /^最高爆分\s+(.+)$/, (value) => `Thắng cao nhất ${value}`) ??
      replace(core, /^剩\s+(.+)$/, (value) => `Còn ${value}`) ??
      replace(core, /^最低下注為\s+(.+)。$/, (value) => `Cược tối thiểu là ${value}`) ??
      replace(core, /^單注上限為\s+(.+)。$/, (value) => `Giới hạn cược đơn là ${value}`) ??
      replace(core, /^(\d+)\/(\d+)\s+命中$/, (hits, total) => `Trúng ${hits}/${total}`) ??
      replace(
        core,
        /^(.+)\s+次\s+·\s+(.+)\s+\/\s+注\s+·\s+上限\s+(.+)$/,
        (rounds, amount, max) => `${rounds} lượt · ${amount} / cược · tối đa ${max}`,
      ) ??
      replace(
        core,
        /^(.+)\s+局\s+·\s+(.+)\s+號\s+·\s+(.+)$/,
        (rounds, count, amount) => `${rounds} ván · ${count} số · ${amount}`,
      ) ??
      replace(core, /^第\s+(.+)\s+格$/, (step) => `Ô ${step}`) ??
      replace(core, /^(.+)\s+格$/, (step) => `${step} ô`) ??
      replace(
        core,
        /^(.+)\s+層\s+·\s+(.+)$/,
        (level, difficulty) => `${level} tầng · ${difficulty}`,
      ) ??
      replace(core, /^通關\s+·\s+(.+)$/, (difficulty) => `Qua màn · ${difficulty}`)
    );
  }
  if (locale === 'en') {
    return (
      replace(core, /^最高爆分\s+(.+)$/, (value) => `Top win ${value}`) ??
      replace(core, /^剩\s+(.+)$/, (value) => `Left ${value}`) ??
      replace(core, /^最低下注為\s+(.+)。$/, (value) => `Min bet is ${value}.`) ??
      replace(core, /^單注上限為\s+(.+)。$/, (value) => `Single-bet limit is ${value}.`) ??
      replace(core, /^(\d+)\/(\d+)\s+命中$/, (hits, total) => `${hits}/${total} hits`) ??
      replace(core, /^第\s+(.+)\s+格$/, (step) => `Step ${step}`) ??
      replace(core, /^(.+)\s+格$/, (step) => `${step} tiles`) ??
      replace(
        core,
        /^(.+)\s+層\s+·\s+(.+)$/,
        (level, difficulty) => `${level} levels · ${difficulty}`,
      ) ??
      replace(core, /^通關\s+·\s+(.+)$/, (difficulty) => `Cleared · ${difficulty}`)
    );
  }
  return null;
}

function localizeHistoryTemplate(core: string, locale: Locale): string | null {
  if (locale === 'th') {
    return (
      replace(
        core,
        /^顯示\s+(.+)\s+-\s+(.+)\s+\/\s+(.+)\s+筆$/,
        (start, end, total) => `แสดง ${start} - ${end} / ${total} รายการ`,
      ) ??
      replace(core, /^第\s+(.+)\s+\/\s+(.+)\s+頁$/, (page, total) => `หน้า ${page} / ${total}`) ??
      replace(core, /^(.+)\s+筆$/, (count) => `${count} รายการ`) ??
      replace(
        core,
        /^投注\s+(.+)\s+(.+)\s+點$/,
        (direction, target) => `เดิมพัน ${localizeInline(locale, direction)} ${target} แต้ม`,
      ) ??
      replace(core, /^開出\s+(.+)\s+點$/, (value) => `ออก ${value} แต้ม`) ??
      replace(core, /^結果：(.+)$/, (result) => `ผลลัพธ์: ${localizeInline(locale, result)}`) ??
      replace(core, /^中獎機率\s+(.+)%$/, (value) => `โอกาสชนะ ${value}%`) ??
      replace(core, /^(.+)\s+段轉輪$/, (segments) => `วงล้อ ${segments} ช่อง`) ??
      replace(core, /^風險：(.+)$/, (risk) => `ความเสี่ยง: ${localizeInline(locale, risk)}`) ??
      replace(core, /^指針停在第\s+(.+)\s+段$/, (segment) => `เข็มหยุดที่ช่อง ${segment}`) ??
      replace(core, /^開出倍率\s+(.+)$/, (value) => `ตัวคูณที่ออก ${value}`) ??
      replace(core, /^(.+)\s+列釘盤$/, (rows) => `กระดานหมุด ${rows} แถว`) ??
      replace(core, /^落在從左數第\s+(.+)\s+格$/, (bucket) => `ตกที่ช่อง ${bucket} จากซ้าย`) ??
      replace(core, /^消除\s+(.+)\s+次$/, (count) => `ลบ ${count} ครั้ง`) ??
      replace(
        core,
        /^免費遊戲\s+(.+)\s+\/\s+(.+)\s+次$/,
        (played, total) => `ฟรีเกม ${played} / ${total} ครั้ง`,
      ) ??
      replace(core, /^本局倍數\s+(.+)×$/, (value) => `ตัวคูณรอบนี้ ${value}×`) ??
      replace(core, /^免費遊戲累積倍數\s+(.+)×$/, (value) => `ตัวคูณสะสมฟรีเกม ${value}×`) ??
      replace(core, /^總倍率\s+(.+)×$/, (value) => `ตัวคูณรวม ${value}×`) ??
      replace(
        core,
        /^命中\s+(.+)\s+\/\s+(.+)\s+個號碼$/,
        (hits, total) => `ถูก ${hits} / ${total} หมายเลข`,
      ) ??
      replace(core, /^本局共有\s+(.+)\s+顆地雷$/, (count) => `รอบนี้มีระเบิด ${count} ลูก`) ??
      replace(core, /^已翻開\s+(.+)\s+格$/, (count) => `เปิดแล้ว ${count} ช่อง`) ??
      replace(core, /^踩到第\s+(.+)\s+格地雷$/, (cell) => `โดนระเบิดที่ช่อง ${cell}`) ??
      replace(core, /^已選擇\s+(.+)\s+層$/, (count) => `เลือกแล้ว ${count} ชั้น`) ??
      replace(core, /^第\s+(.+)\s+層踩到陷阱$/, (level) => `เจอกับดักที่ชั้น ${level}`) ??
      replace(
        core,
        /^已通過\s+(.+)\s+\/\s+(.+)\s+條車道$/,
        (current, total) => `ผ่านแล้ว ${current} / ${total} เลน`,
      ) ??
      replace(core, /^第\s+(.+)\s+條車道未通過$/, (step) => `ไม่ผ่านเลนที่ ${step}`) ??
      replace(core, /^開出\s+(.+)\s+號$/, (slot) => `ออกหมายเลข ${slot}`) ??
      replace(core, /^共有\s+(.+)\s+筆下注中獎$/, (count) => `มีเดิมพันชนะ ${count} รายการ`) ??
      replace(
        core,
        /^第\s+(.+)\s+段\s+·\s+(.+)$/,
        (segment, multiplier) => `ช่อง ${segment} · ${multiplier}`,
      ) ??
      replace(
        core,
        /^共\s+(.+)\s+條中獎線，合計\s+(.+)$/,
        (count, total) => `ไลน์ชนะ ${count} ไลน์ รวม ${total}`,
      ) ??
      replace(core, /^(.+)\s+符號$/, (count) => `${count} สัญลักษณ์`) ??
      replace(
        core,
        /^(.+)個\s+(.+)×\s+·\s+(.+)個\s+(.+)×$/,
        (countA, valueA, countB, valueB) => `${countA} อัน ${valueA}× · ${countB} อัน ${valueB}×`,
      ) ??
      replace(core, /^(.+)個\s+(.+)×$/, (count, value) => `${count} อัน ${value}×`) ??
      replace(
        core,
        /^(.+)\s+·\s+(.+)$/,
        (label, direction) =>
          `${localizeInline(locale, label)} · ${localizeInline(locale, direction)}`,
      ) ??
      replace(
        core,
        /^連續\s+(.+)\s+個相同符號中獎$/,
        (count) => `ชนะด้วยสัญลักษณ์เหมือนกันต่อเนื่อง ${count} อัน`,
      ) ??
      replace(core, /^手牌\s+(.+)$/, (index) => `มือ ${index}`) ??
      replace(core, /^點數\s+(.+)$/, (score) => `แต้ม ${score}`) ??
      replace(core, /^下注\s+(.+)$/, (amount) => `เดิมพัน ${amount}`) ??
      replace(core, /^派彩\s+(.+)$/, (amount) => `รางวัล ${amount}`) ??
      replace(core, /^結果\s+(.+)$/, (result) => `ผลลัพธ์ ${localizeInline(locale, result)}`) ??
      replace(core, /^符號\s+(.+)$/, (symbol) => `สัญลักษณ์ ${symbol}`) ??
      replace(core, /^第\s+(.+)\s+排$/, (row) => `แถวที่ ${row}`)
    );
  }

  if (locale === 'vi') {
    return (
      replace(
        core,
        /^顯示\s+(.+)\s+-\s+(.+)\s+\/\s+(.+)\s+筆$/,
        (start, end, total) => `Hiển thị ${start} - ${end} / ${total} mục`,
      ) ??
      replace(core, /^第\s+(.+)\s+\/\s+(.+)\s+頁$/, (page, total) => `Trang ${page} / ${total}`) ??
      replace(core, /^(.+)\s+筆$/, (count) => `${count} mục`) ??
      replace(
        core,
        /^投注\s+(.+)\s+(.+)\s+點$/,
        (direction, target) => `Cược ${localizeInline(locale, direction)} ${target} điểm`,
      ) ??
      replace(core, /^開出\s+(.+)\s+點$/, (value) => `Mở ra ${value} điểm`) ??
      replace(core, /^結果：(.+)$/, (result) => `Kết quả: ${localizeInline(locale, result)}`) ??
      replace(core, /^中獎機率\s+(.+)%$/, (value) => `Xác suất thắng ${value}%`) ??
      replace(core, /^(.+)\s+段轉輪$/, (segments) => `Vòng quay ${segments} ô`) ??
      replace(core, /^風險：(.+)$/, (risk) => `Rủi ro: ${localizeInline(locale, risk)}`) ??
      replace(core, /^指針停在第\s+(.+)\s+段$/, (segment) => `Kim dừng ở ô ${segment}`) ??
      replace(core, /^開出倍率\s+(.+)$/, (value) => `Hệ số mở ra ${value}`) ??
      replace(core, /^(.+)\s+列釘盤$/, (rows) => `Bảng chốt ${rows} hàng`) ??
      replace(core, /^落在從左數第\s+(.+)\s+格$/, (bucket) => `Rơi vào ô ${bucket} từ trái`) ??
      replace(core, /^消除\s+(.+)\s+次$/, (count) => `Xóa ${count} lần`) ??
      replace(
        core,
        /^免費遊戲\s+(.+)\s+\/\s+(.+)\s+次$/,
        (played, total) => `Free game ${played} / ${total} lượt`,
      ) ??
      replace(core, /^本局倍數\s+(.+)×$/, (value) => `Hệ số ván này ${value}×`) ??
      replace(
        core,
        /^免費遊戲累積倍數\s+(.+)×$/,
        (value) => `Hệ số tích lũy free game ${value}×`,
      ) ??
      replace(core, /^總倍率\s+(.+)×$/, (value) => `Tổng hệ số ${value}×`) ??
      replace(
        core,
        /^命中\s+(.+)\s+\/\s+(.+)\s+個號碼$/,
        (hits, total) => `Trúng ${hits} / ${total} số`,
      ) ??
      replace(core, /^本局共有\s+(.+)\s+顆地雷$/, (count) => `Ván này có ${count} mìn`) ??
      replace(core, /^已翻開\s+(.+)\s+格$/, (count) => `Đã mở ${count} ô`) ??
      replace(core, /^踩到第\s+(.+)\s+格地雷$/, (cell) => `Trúng mìn ở ô ${cell}`) ??
      replace(core, /^已選擇\s+(.+)\s+層$/, (count) => `Đã chọn ${count} tầng`) ??
      replace(core, /^第\s+(.+)\s+層踩到陷阱$/, (level) => `Trúng bẫy ở tầng ${level}`) ??
      replace(
        core,
        /^已通過\s+(.+)\s+\/\s+(.+)\s+條車道$/,
        (current, total) => `Đã vượt ${current} / ${total} làn`,
      ) ??
      replace(core, /^第\s+(.+)\s+條車道未通過$/, (step) => `Không vượt qua làn ${step}`) ??
      replace(core, /^開出\s+(.+)\s+號$/, (slot) => `Mở ra số ${slot}`) ??
      replace(core, /^共有\s+(.+)\s+筆下注中獎$/, (count) => `Có ${count} cược trúng`) ??
      replace(
        core,
        /^第\s+(.+)\s+段\s+·\s+(.+)$/,
        (segment, multiplier) => `Ô ${segment} · ${multiplier}`,
      ) ??
      replace(
        core,
        /^共\s+(.+)\s+條中獎線，合計\s+(.+)$/,
        (count, total) => `${count} dòng thắng, tổng ${total}`,
      ) ??
      replace(core, /^(.+)\s+符號$/, (count) => `${count} biểu tượng`) ??
      replace(
        core,
        /^(.+)個\s+(.+)×\s+·\s+(.+)個\s+(.+)×$/,
        (countA, valueA, countB, valueB) =>
          `${countA} biểu tượng ${valueA}× · ${countB} biểu tượng ${valueB}×`,
      ) ??
      replace(core, /^(.+)個\s+(.+)×$/, (count, value) => `${count} biểu tượng ${value}×`) ??
      replace(
        core,
        /^(.+)\s+·\s+(.+)$/,
        (label, direction) =>
          `${localizeInline(locale, label)} · ${localizeInline(locale, direction)}`,
      ) ??
      replace(
        core,
        /^連續\s+(.+)\s+個相同符號中獎$/,
        (count) => `Thắng với ${count} biểu tượng giống nhau liên tiếp`,
      ) ??
      replace(core, /^手牌\s+(.+)$/, (index) => `Tay bài ${index}`) ??
      replace(core, /^點數\s+(.+)$/, (score) => `Điểm ${score}`) ??
      replace(core, /^下注\s+(.+)$/, (amount) => `Cược ${amount}`) ??
      replace(core, /^派彩\s+(.+)$/, (amount) => `Trả thưởng ${amount}`) ??
      replace(core, /^結果\s+(.+)$/, (result) => `Kết quả ${localizeInline(locale, result)}`) ??
      replace(core, /^符號\s+(.+)$/, (symbol) => `Biểu tượng ${symbol}`) ??
      replace(core, /^第\s+(.+)\s+排$/, (row) => `Hàng ${row}`)
    );
  }

  if (locale === 'en') {
    return (
      replace(
        core,
        /^顯示\s+(.+)\s+-\s+(.+)\s+\/\s+(.+)\s+筆$/,
        (start, end, total) => `Showing ${start} - ${end} / ${total} entries`,
      ) ??
      replace(core, /^第\s+(.+)\s+\/\s+(.+)\s+頁$/, (page, total) => `Page ${page} / ${total}`) ??
      replace(core, /^(.+)\s+筆$/, (count) => `${count} entries`) ??
      replace(core, /^(.+)\s+符號$/, (count) => `${count} symbols`) ??
      replace(
        core,
        /^(.+)個\s+(.+)×\s+·\s+(.+)個\s+(.+)×$/,
        (countA, valueA, countB, valueB) =>
          `${countA} symbols ${valueA}× · ${countB} symbols ${valueB}×`,
      )
    );
  }

  return null;
}

function localizeInline(locale: Locale, value: string): string {
  const trimmed = value.trim();
  return textMaps[locale]?.get(trimmed) ?? textMaps[locale]?.get(toSimplified(trimmed)) ?? trimmed;
}

function replace(
  value: string,
  pattern: RegExp,
  build: (...matches: string[]) => string,
): string | null {
  const match = value.match(pattern);
  return match ? build(...match.slice(1)) : null;
}

function buildTextMap(target: unknown, extra: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>(Object.entries(extra));
  collectStringPairs(zhHant, target, map);
  collectStringPairs(zhHans, target, map);
  collectStringPairs(en, target, map);
  collectStringPairs(th, target, map);
  collectStringPairs(vi, target, map);
  for (const [traditional, translated] of Object.entries(extra)) {
    map.set(toSimplified(traditional), translated);
  }
  for (const sourceExtra of [LEGACY_ENGLISH_TEXT, LEGACY_THAI_TEXT, LEGACY_VIETNAMESE_TEXT]) {
    for (const [traditional, sourceTranslated] of Object.entries(sourceExtra)) {
      const translated = extra[traditional];
      if (!translated) continue;
      map.set(traditional, translated);
      map.set(toSimplified(traditional), translated);
      map.set(sourceTranslated, translated);
    }
  }
  return map;
}

function collectStringPairs(source: unknown, target: unknown, map: Map<string, string>): void {
  if (typeof source === 'string' && typeof target === 'string') {
    map.set(source, target);
    return;
  }
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;
  for (const [key, sourceValue] of Object.entries(source)) {
    collectStringPairs(sourceValue, (target as Record<string, unknown>)[key], map);
  }
}
