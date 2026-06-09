# Entertainment Shaper 設計稿

產出日期：2026-06-09

## 目標

增加玩家遊戲體感，讓自動模型控輸時不要呈現為「一直 0 倍、一直直接死、一直完全不中」。

這份設計稿只定義包裝層，不改目前控制系統。核心目標是：

- 玩家仍然會依照現有控制模型長期往下。
- 玩家會更常看到小中獎、小連線、先過幾關、接近回本。
- 這些小中獎機會不能變成真實盈利漏洞。
- 不能讓倍投、固定路線、低倍 cashout、自動投注變成套利。

## 非目標

這不是新的控制系統。

不做以下事情：

- 不改控制優先序。
- 不新增遊戲自己的隱藏控制優先級。
- 不讓體感層覆蓋入金控制、爆分控制、手動偵測、封頂。
- 不讓體感層決定會員最終輸贏。
- 不讓體感層直接寫餘額或交易紀錄。

## 現有控制優先序

體感層必須放在控制核心之後。

控制核心仍維持：

1. 硬封頂與意外爆分保護
2. 入金相關控制與在線均分
3. 爆分控制
4. 手動偵測 / 輸贏控制
5. 會員封頂 / 代理線封頂
6. 自動模型
7. 自然開獎

目前程式中的全局會員日贏封頂是 10,000。自動模型目前流程是：

1. 先咬到本金 20%
2. 再好贏回本金 40%
3. 回到 40% 後持續控輸

體感層只能在控制核心已經產生 `ControlOutcome` 後工作。

## 分層

建議資料流：

```text
Natural Result
  -> Control Decision
  -> Payout Envelope
  -> Entertainment Shaper
  -> Game-specific Result Picker
  -> Persist Bet / Round / Transaction
  -> Render
```

### Control Decision

現有 `applyControls` 決定是否介入，以及方向：

- `WIN`
- `LOSS`
- 自然結果
- `maxPayout`
- `minMultiplier`
- `maxMultiplier`
- `flipReason`

這一層不因體感需求改動。

### Payout Envelope

根據 `ControlOutcome` 建立本局允許的財務範圍。

範例：

```ts
type EntertainmentEnvelope = {
  enabled: boolean;
  source: 'auto_balance';
  phase: 'BITE_TO_20' | 'REVIVE_TO_40' | 'DRAIN_TO_ZERO';
  desired: 'WIN' | 'LOSS' | 'NATURAL';
  amount: Decimal;
  maxPayout: Decimal;
  maxProfit: Decimal;
  preferredMultiplierMin: Decimal;
  preferredMultiplierMax: Decimal;
  hardMultiplierMax: Decimal;
  allowTinyProfit: boolean;
};
```

硬限制：

- `maxPayout` 不能超過控制核心給出的 `maxPayout`。
- `maxProfit` 不能突破全局日贏封頂剩餘額度。
- `desired = LOSS` 時，預設 `maxPayout <= amount`。
- 若允許微盈利，也必須由 envelope 明確開啟且有總量限制。

### Entertainment Shaper

只做「呈現結果」選擇，不做財務決策。

輸入：

- 遊戲類型
- 原始自然結果
- `ControlOutcome`
- `EntertainmentEnvelope`

輸出：

- 遊戲合法結果
- 顯示用 profile
- 日誌用 shaping metadata

範例：

```ts
type EntertainmentShapeResult<TGameResult> = {
  result: TGameResult;
  presentationProfile:
    | 'none'
    | 'small_hit'
    | 'near_miss'
    | 'safe_progress'
    | 'low_free_spin'
    | 'controlled_drain';
  targetMultiplier: Decimal;
  originalMultiplier: Decimal;
  cappedByEnvelope: boolean;
};
```

## 只先套自動模型

第一版只套用在 `auto_balance_*`：

- `auto_balance_bite`
- `auto_balance_revive`
- `auto_balance_drain`

其他來源不套：

- `deposit_control`
- `manual_detection`
- `burst_win`
- `burst_loss`
- `member_win_cap`
- `agent_line_cap`
- `global_member_daily_win_cap`
- `global_accidental_burst_cap`

原因：這些控制本身已經有明確目標，若再套體感層，會讓日誌與財務結果難以判斷。

## 自動模型 envelope 建議

### BITE_TO_20

目標：玩家往本金 20% 下滑，但不要一直完全不中。

建議：

- 多數結果：`0.2x - 0.9x`
- 少量結果：`1.0x - 1.2x`
- 極少數微盈利：必須有每會員每日總量限制
- 對倍投行為收緊：下注額快速放大時，禁止微盈利

### REVIVE_TO_40

目標：玩家慢慢回到本金 40%，不能一注補滿。

建議：

- 多數結果：`0.8x - 1.5x`
- 少量結果：`1.6x - 2.0x`
- 單局 payout 不能超過 `reviveTargetBalance - currentBalance + amount`
- 命中率高，但盈利幅度小

### DRAIN_TO_ZERO

目標：回到 40% 後持續往下，但保留遊戲感。

建議：

- 多數結果：`0.2x - 0.8x`
- 偶爾結果：`0.9x - 1.0x`
- 原則上不允許真實盈利
- 若遊戲需要體感，可用接近回本、先過幾步、低倍免費遊戲呈現

## 遊戲類型設計

### 拉霸 3x3 / 5x3 / Mega 一般轉

自動模型控輸時，拉霸不應該總是 0 倍。

建議 profile：

| 類型 | 呈現 | 實際效果 |
|---|---|---|
| small_hit | 小連線、小派彩 | 多數低於下注額 |
| near_miss | 差一格大獎、差一個 scatter | 無派彩或低派彩 |
| low_free_spin | 免費遊戲有動畫但總派彩低 | 不突破 envelope |

建議倍率：

- BITE_TO_20：`0.2x - 1.2x`
- REVIVE_TO_40：`0.8x - 2.0x`
- DRAIN_TO_ZERO：`0.2x - 1.0x`

免費遊戲：

- 可觸發低派彩免費遊戲，但總 payout 必須小。
- 自動模型控輸時，不允許免費遊戲變成高倍爆分入口。
- 爆分控制明確觸發時，才允許走爆分 profile。

### 踩地雷

自動模型控輸時，不建議第一顆就常常中雷。

建議：

- 允許玩家先安全翻 1 到 3 顆。
- 顯示「好像有機會」的進度。
- 可領獎倍率多數低於 1x。
- 玩家加注、倍投、連續追同玩法時，降低安全步數。

建議倍率：

- BITE_TO_20：安全幾顆，但 cashout 多數 `0.4x - 0.9x`
- REVIVE_TO_40：允許 `1.0x - 2.0x` 內的小贏
- DRAIN_TO_ZERO：多數 `0.3x - 0.8x`

硬限制：

- 不允許同一種低風險 mines 設定產生穩定正期望。
- 不允許 cashout 時才補救；reveal 前就要知道該格是否安全。

### 爬樓梯

自動模型控輸時，可以讓玩家多過幾階，但不能讓固定路線穩贏。

建議：

- 每一階都重新決定安全格，不能固定第一格或固定路線。
- 簡單 / 中等可比較有體感。
- 困難 / 專家 / 大師後段要收斂。
- 專家 / 大師不應讓後段高倍成為套利點。

建議倍率：

- BITE_TO_20：多數低於 `1x`
- REVIVE_TO_40：可到 `2x` 以內
- DRAIN_TO_ZERO：多數低於 `1x`

硬限制：

- 不允許「同一路線連點」長期有效。
- 不允許 cashout 後才用封頂補救。
- 每一步進度都要即時套 envelope。

## 投注行為風險偵測

體感層必須觀察近期投注行為。以下情況要收緊 envelope：

- 連續倍投：例如 10 -> 100 -> 1000。
- 固定低倍策略：例如 crash 固定 1.1x。
- 固定格子策略：例如 tower 每層都點第一格。
- 同一遊戲短時間大量投注。
- 下注額接近限紅上限。
- 會員已接近全局日贏封頂。

收緊方式：

- 禁止 `allowTinyProfit`。
- 降低 `hardMultiplierMax`。
- 增加 near-miss / low payout 比例。
- 多步驟遊戲在下一步就控制，不等 cashout。

## 日誌

現有控制日誌應保留 `flipReason` 作為控制來源。

建議新增 shaping metadata，不取代控制來源：

```ts
type EntertainmentLogMeta = {
  presentationProfile: string;
  envelopePhase: string;
  originalMultiplier: string;
  shapedMultiplier: string;
  envelopeMaxPayout: string;
  cappedByEnvelope: boolean;
  riskFlags: string[];
};
```

範例日誌語意：

```text
自動模型 · 咬到20% · small_hit · 原始 0.00x -> 包裝 0.60x · 未突破 envelope
```

後台查問題時必須能分辨：

- 是哪個控制來源介入。
- 體感層是否有包裝。
- 包裝後是否被 envelope 裁切。
- 是否因倍投 / 固定路線 / 低倍策略收緊。

## 測試策略

第一階段只寫 helper 與模擬測試，不接真實遊戲。

必要測試：

1. `LOSS` envelope 不會產生大於下注額的 payout。
2. `maxPayout` 永遠不超過控制核心給定值。
3. 全局 10,000 日贏封頂永遠優先。
4. 自動模型 BITE_TO_20 長期仍往下。
5. 自動模型 REVIVE_TO_40 會慢慢回 40%，不會一注補滿。
6. 自動模型 DRAIN_TO_ZERO 長期仍往下。
7. 拉霸 small_hit 不會變成正期望。
8. 踩地雷前幾顆安全不會讓 cashout 正期望。
9. 爬樓梯固定路線不會長期有效。
10. 投注額倍投時 envelope 會收緊。

建議模擬：

- 每類遊戲至少 100,000 局。
- 測試下注額：10、20、100、1000、3000、5000。
- 測試策略：固定注、倍投、低倍 cashout、固定格子、連續追高。
- 驗證每個會員最終淨利不可突破全局封頂。

## 實作順序

1. 新增 `EntertainmentEnvelope` helper，只回傳 envelope，不改遊戲。
2. 新增 `EntertainmentShaper` helper，只在測試中使用。
3. 寫拉霸 / 踩地雷 / 爬樓梯三類模擬測試。
4. 日誌新增 shaping metadata。
5. 先接拉霸一般轉。
6. 再接踩地雷 reveal。
7. 最後接爬樓梯 step。
8. Mega 免費遊戲最後再接，避免和爆分控制互相干擾。

## 上線條件

正式接入任何遊戲前，必須確認：

- 原控制測試全過。
- 新體感層模擬測試全過。
- 多步驟遊戲每一步都有即時 envelope。
- cashout 無法繞過 envelope。
- 後台控制日誌可以看懂控制來源與體感包裝差異。
- 出問題時可以用 feature flag 關閉體感層。

## Feature Flag

建議第一版加 feature flag：

```text
ENTERTAINMENT_SHAPER_ENABLED=false
ENTERTAINMENT_SHAPER_GAMES=slot,mines,tower
ENTERTAINMENT_SHAPER_SOURCES=auto_balance
```

預設關閉。測試環境先開，確認後再逐步開正式環境。

## 第一版實作註記

第一版已接入：

- 拉霸：自動模型控輸時可選擇低倍小連線，派彩仍低於下注額。
- 6x5 mega 免費遊戲：一般 / 自然 / 非指定控制來源一律壓在 `0x - 1x`；只有控制贏、入金控制、爆分控制、自動模型回彈等指定贏控制可超過 `1x`，且仍受上層 envelope 與封頂限制。
- 地雷 / 爬樓梯：自動模型控輸時可優先放過前段不超過 `2.00x` 的安全進度。
- 地雷 / 爬樓梯 cashout：自動模型控輸時可包裝成低倍結算，派彩仍低於下注額。
- 控制日誌 `resultData.entertainment` 會記錄原倍率、包裝倍率、envelope 階段和是否被上限裁切。

目前已放寬 mines / tower 的前段娛樂進度：

- 自動模型控輸時，前段 `<= 2.00x` 的進度可優先放過，避免玩家一開始就死亡。
- `> 2.00x` 不放過，避免高倍段變成套利。
- `DRAIN_TO_ZERO` 階段可放過的步數比前兩階段更短。
- cashout 仍會重新套控制、娛樂 envelope 和全局 10,000 日贏封頂。

若未來要讓 mines / tower 在 `2.00x` 以上仍有娛樂進度，必須先在 round 狀態寫入控輸鎖定 metadata，讓後續 cashout 必定套同一個 envelope；否則玩家可能利用點中後立刻結算套利。
