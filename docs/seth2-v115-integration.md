# 黃金賽特 II v1.1.5 整合基準

本文件記錄經授權觀察的正式遊戲版本與本地整合契約。登入資料、工作階段 token 與玩家資料不會寫入儲存庫。

## 版本與素材

- 遊戲版本：`1.1.5`
- 遊戲 revision：`361d567d94ac569664c82068a30b762e8d8438b8`
- Slot Framework：`1.1.2_1`
- Framework revision：`40401f29702686de9cfed69b217641b6029834f7`
- Cocos Creator：`3.7.2`
- 主遊戲 bundle：3,455 個邏輯路徑、3,501 個 UUID、27 個 pack
- 完整支援 `portrait`、`landscape`
- 完整支援 `en`、`th`、`tr`、`vn`、`zh-cn`、`zh-tw`
- 音效／音樂：94 個 MP3 cue，包含主遊戲、覺醒免費遊戲、男女角色技能、倍數升級、消除、獎項與 JP 音效
- 三種購買介面、規則圖片、角色 Spine、符號、模糊符號、免費遊戲與獎項素材均保留原版資源

素材位於 `apps/web/public/games/storm-of-seth-2-v115` 與對應的 `slotFramework` hash 目錄。`scripts/sync-seth2-v115.mjs` 可重建素材，`asset-manifest.json` 記錄每個檔案的位元組數與 SHA-256；同步後必須執行 Web 測試確認沒有缺檔或被改寫。

## 遊戲規則契約

- 盤面資料為 5 列 × 6 欄，共 30 格，採 pay-anywhere 消除玩法。
- 一般符號為 1–9；倍數物件由 10–13 表示；14 為 JP；15 為 Scatter；客戶端另使用 16 金色 Scatter、17 男角、18 女角。
- 4／5／6 個 Scatter 的賠付為總押注 60／100／2,000 倍，觸發時給 15 局免費遊戲；免費遊戲再觸發增加 5 局。
- `freeGame`：購買價 200 倍，有機會進入覺醒之力。
- `superFreeGame`：購買價 500 倍，必定進入覺醒之力。
- `superMainGame`：購買價 2,000 倍，進行一局超級主遊戲，不建立 15 局免費遊戲 session。
- 覺醒入口以 3 個普通 Scatter 加 1 個金色 Scatter 呈現；普通入口至少有 4 個普通 Scatter。購買入口盤面不會消耗第一局免費遊戲。
- 男角技能會複製倍數物件；女角技能依 Level 1／2／3 選定 1／2／3 顆倍數物件並鎖定 2／4／6 局，未被選中的同盤倍率球維持 `lock=0`。實機 Level 3 狀態依 6 → 5 → 4 → 3 → 2 → 1 顯示。
- 倍數可在沒有消分的盤面單獨出現；只有同局有有效消除時才參與該局派彩。
- 正式盤面倍率球由低至高依序為綠色 T4（2–5）、藍色 T3（10–25）、紫色 T2（50–100）、紅／金色 T1（200–500）。倍數升級序列包含 2、3、4、5、6、8、10、12、15、18、25、50、100、200、300、500；稀有球升級後仍保持稀有屬性，可於後續消除再次升級。
- 鎖定球會留在後續免費局盤面；有消除時會再次加入累積倍率與派彩，沒有消除時不會增加倍率銀行。角色技能可能在連消的後段才發動，不能固定在第一個 view。

## 授權實機觀察

2026-08-15 以正式站最低 `stakeValue=1`、`ratioValue=0.1`（20 線，畫面總注 2）完成三種購買模式及一般旋轉觀察。只保存去識別化的協定形狀與遊戲規則，不保存登入資料、query token 或玩家個資。

- 普通購買：200 倍，入口 4 個普通 Scatter，顯示 15 FREE SPINS；完整實測 18 個 state。無消除局可以掉落倍率球，但該球不會加入倍率銀行。
- 覺醒購買：500 倍，入口 3 個普通 Scatter 加 1 個金色 Scatter，顯示 15 AWAKENING POWER；完整實測 25 個 state。女角在後段連消發動 Level 3 鎖定，鎖定稀有球連續出現 6 → 8 → 10 → 12 → 15 → 18 升級。
- 永久覺醒：2,000 倍，實測保證落下 500x；男角把該球分裂成兩份相同副本，盤面顯示三顆 500x，基礎分 1.3 最終派彩 1,950。正式回應的所有 `superMainGameCount` 均為 0。
- 另一組正式 2,000 倍回應確認同一請求可包含多段獨立主遊戲：每段先回傳逐次累加的原始消分，再以無消分 view 收集當段倍率派彩；零消分段只回傳一次落球盤面，不會用重複空盤面湊動畫長度。
- 一般旋轉依序送出 `spin`、`closeSpin`；購買則先送 `action=buyFeature` 取得 `spinId`，再以相同 `spinId` 取得完整動畫陣列，結束後才送 `closeSpin`。

## 前後端協定

原版客戶端的 Socket.IO 事件由同源 bridge 轉送至 `/api/games/seth2/source`。支援：

- `initial`
- `spin`
- `closeSpin`
- `updateSettings`
- `getBetRecords`／`getUserReport`
- `getSlotTables`／`getSlotTableDetail`／`updateSlotTable`／`lockSlotTable`

購買特色是兩段式流程：

1. 客戶端送出 `spin`，`action=buyFeature`；後端在鎖定交易內完成扣款、控制與唯一結算，僅回傳 `engine.gameState.spinId`。
2. 客戶端以該 `spinId` 再送一次 `spin`；後端讀取已保存的結算並回傳動畫盤面，不再扣款、不再產生亂數結果。

這個流程避免重複扣款，也符合原版 `BUY_FEATURE_RESPONSE → buyFeatureSpin(spinId)` 的行為。

原版 v1.1.5 會從同一個 `engine.gameState` 陣列逐局播放整段免費遊戲，而本地後端為了交易與控制安全仍逐局結算。因此 bridge 會在入口結果確定後依序預取剩餘免費局，保留每局後端已控制的盤面與最終餘額，再合併並重新編排 `currentView`／`totalViews`。只有入口 state 設定 `startFreeGame`，後續局不會重複開啟進場提示。

橫向版 Slot Framework 在總贏分為 0 時沒有完成 tween callback；bridge 只針對這個零值且要求完成的事件補回一次性 completion，避免 Scatter 入場後卡住，並不改動得分。男角複製球由數學結果的 `type17_mul_list` 補入落下盤面，`splitList` 因此一定指向實際倍數球節點，不會再送出空目標造成技能流程停住。男女角色事件會先尋找實際含 17／18 的連消段，再於該段送出技能等級、分裂目標或鎖定狀態。

## 派彩與控制一致性

後端結果是唯一真實來源。控制系統在建立可見盤面之前選定可表示的結果，再由同一份 `returnData` 產生：

- 每段消除盤面與落下位置
- 中獎符號及其位置
- 倍數球、倍數升級、男角分裂與女角鎖定
- 免費遊戲／覺醒狀態
- 當局與累計派彩
- 帳務 Bet、Ledger 與玩家餘額

連消落下座標掛在「正在消除的當前盤面」，並由底部往上移動，避免 Cocos 符號節點在同欄位被提早覆蓋。Scatter 觸發盤面則保留觸發符號，交由原版免費遊戲進場動畫處理，不當作一般消分符號先行移除。

前端不會先播放一個高倍結果再縮減派彩。最終 `gameState.roundWinnings` 必須等於保存的 `returnData.total_gold`，Bet payout 與錢包入帳亦取自同一結果。

女角鎖定期間，控制系統在選擇盤面前就把可見的鎖定球納入可表示倍率；後端再把同一份倍率拆成 `multiplierBankBefore`、當局新增值與 `multiplierBankAfter`。因此控制結果、球面數字、倍率銀行、動畫總分與實際入帳不會各自二次修正。

## 驗證

```sh
pnpm --filter @bg/server typecheck
pnpm --filter @bg/server test -- --run src/modules/games/seth2/seth2.service.test.ts src/modules/games/seth2/seth2.source.test.ts
pnpm --filter @bg/web typecheck
pnpm --filter @bg/web test
```

Web 測試會逐檔核對素材 manifest、雙方向／六語言、三種購買素材、男女角色、94 個音訊檔、60 FPS、零分入場 callback 與完整免費遊戲序列，並確認正式環境不顯示 FPS／debug overlay。後端測試會核對遊戲局數、Scatter、四種倍率球顏色、男女角色在實際連消段的技能等級與目標節點、2／4／6 局鎖定、鎖定球重複收集、控制結果、5×6 完整盤面、派彩一致性，以及購買特色的兩段式防重複扣款流程。
