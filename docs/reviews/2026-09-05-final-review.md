# 金寶寶平台 final review — 2026-09-05

> 本文保留修正前的調查證據與當時驗收結論。後續修正及重測請見 [修正交付記錄](2026-09-05-release-fixes.md)，不要將本文的「未修正」視為目前版本狀態。

## 結論

**不通過整體驗收。** 已重現帳目精度、轉帳重試、登入撤銷及無盤面仍可開局等問題。既有測試通過，不代表每個按鈕、每款遊戲及錯誤恢復流程都已正確。

本輪是 review，沒有修正或推送應用程式，也沒有變更正式帳戶、餘額、控制設定、畫質、動畫或玩法。以下是本輪確認的新發現，不應與先前已修項目混為一談。

## 已確認的問題

### 1. P1 — 轉帳允許超過兩位小數，兩邊入帳後總額可能增加

- `apps/server/src/modules/admin/transfers/transfer.schema.ts:3` 的金額規則接受任意位小數。
- `apps/admin/src/components/shared/AgentTransferModal.tsx:223` 僅檢查有效且大於零；`amountReady` 同樣沒有兩位小數限制。
- `apps/server/src/modules/admin/transfers/transfer.service.ts:53` 分別計算轉出、轉入餘額，再寫入 `Decimal(20,2)` 欄位。
- 正式版後台搭配攔截 API 的隔離測試，可送出 `amount: "0.005"`；後端 schema 也接受。
- 正式 PostgreSQL 僅執行常數 SELECT，確認 `1000 - 0.005` 存為兩位小數是 `1000.00`，`1000 + 0.005` 是 `1000.01`：兩戶總額增加 `0.01`。未操作任何帳戶資料。

影響：授權使用者不需繞過登入，就可能建立不守恆的轉帳；轉帳紀錄金額也可能與實際扣點不同。

建議：所有轉帳入口在交易前統一驗證金額精度、範圍及正負規則。不要僅修前端；新增實際 PostgreSQL 的總額守恆及邊界測試。

### 2. P1 — 轉帳已完成，仍可能回報失敗並讓使用者重複轉帳

前端路徑：

- `apps/admin/src/components/shared/AgentTransferModal.tsx:243` 先 POST 轉帳，再於相同 `try` 中 GET `/auth/me`。
- GET 失敗便進入通用錯誤處理；表單保留原金額、重新開放確認按鈕。
- `apps/admin/src/components/shared/TransferModal.tsx:209` 有相同成功轉帳與資料刷新混在一起的結構。
- 瀏覽器隔離重現：POST 成功、後續 GET 503，仍顯示系統錯誤並可再次送出。

後端路徑：

- `apps/server/src/modules/admin/transfers/transfer.service.ts:78` 在餘額交易已提交後，才寫入 audit。
- audit 失敗會把已成功轉帳變成失敗回應；轉帳沒有操作冪等鍵。
- 使用實際 `TransferService` 與記憶體假資料庫重現：第一次丟出 audit 錯誤，但餘額已變為 `990/1010`；再試一次又變為 `980/1020`。

建議：金融交易與必要稽核具備一致提交保證；增加可重送的操作識別碼；區分「轉帳成功、刷新失敗」與「轉帳未完成」，避免誤導重試。需涵蓋提交後斷線、audit 失敗及連點的回歸測試。

### 3. P1 — 地雷、爬樓梯畫面建立失敗，仍可送出開局下注

- `apps/web/src/pages/games/MinesPage.tsx:114` 初始化失敗後清除 scene 並顯示錯誤，但 `handleStart`（149）沒有檢查畫面是否可用；開始按鈕（509）只檢查 busy 與餘額。
- `apps/web/src/pages/games/TowerPage.tsx:183` 與開始按鈕（506）存在相同問題。
- 隔離瀏覽器模擬繪圖 context 無法建立：兩款都無盤面，但開始仍可按；送出 `/start` 後假餘額由 `1000` 變成 `990`，進入 ACTIVE，卻沒有格子可操作，零步數也無法領獎。
- 後端 `apps/server/src/modules/games/mines/mines.service.ts:60` 確實會扣點並建立 ACTIVE 回合。因此不是只有按鈕外觀問題。

建議：加入明確的 scene-ready 狀態；初始化失敗、尚未完成或 context lost 時不得開新局；提供可恢復的重新載入入口。測試必須模擬 GPU 不可用及資源失敗。

### 4. P1 — 開局回應遺失時，前端誤當作交易回滾

- `apps/web/src/pages/games/MinesPage.tsx:170` 與 `TowerPage.tsx:201` 遇到任意請求錯誤即還原下注前的本地餘額。
- `/active` 僅在掛載時查詢；開局失敗後沒有立即重新確認權威回合狀態，而且初次恢復失敗被忽略。
- 隔離模擬「伺服器已提交，回應被閘道轉為 503」：前端顯示下注前 `1000` 與開始按鈕，沒有再查 `/active`；實際假伺服器已有回合、應剩 `990`。

影響：遊戲內外可暫時顯示不同餘額，使用者以為沒下注卻已有未完局；必須重新進入才可能恢復。此測試確認的是未知結果處理錯誤，並非證明正式環境已發生相同交易。

建議：逾時/斷線應視為「結果未知」，查詢回合與錢包後才能允許再次下注；不要直接認定伺服器回滾。配合開局冪等及斷線恢復測試。

### 5. P1 — 登出及重設密碼未可靠撤銷舊 access token

- `apps/server/src/plugins/auth.ts:53` 與 `plugins/adminAuth.ts:63` 只有資料庫 session ID 非空時才比對；清空 ID 反而跳過撤銷檢查。
- `apps/server/src/modules/auth/auth.service.ts:114` 登出會清空 session ID。
- `apps/server/src/modules/admin/members/member.service.ts:480`、`agents/agent.service.ts:558` 重設密碼只更新 hash、撤銷 refresh token，沒有撤銷現有 session。
- 使用實際 Fastify 認證 hook、JWT 及 reset/logout 方法，資料庫改為假資料：會員重設密碼後舊 token 回 200；代理重設密碼後舊 token 回 200；會員登出後舊 token 仍回 200。

影響：被複製的舊 access token 在到期前仍可能使用，不能依賴登出/重設密碼立即阻斷存取。未測試或使用任何真實帳號 token。

建議：明確定義無 session 就是已撤銷；重設密碼、登出與 session/refresh 撤銷一致處理。補真實 Fastify 流程的撤銷、重新登入、併發及過期測試。

### 6. P2 — 唯讀子帳號仍看到可操作的後台寫入按鈕

- `apps/admin/src/pages/agents/AgentHierarchyPage.tsx:469` 起的轉點、退水、限紅、重設、狀態及備註等按鈕，沒有依唯讀角色統一限制。
- 正式版後台搭配假 SUB_ACCOUNT 身分，仍顯示可按的新增會員/代理及多項管理按鈕。
- `apps/server/src/modules/admin/admin.plugin.ts:19` 的全域守門則正確禁止子帳號與凍結代理寫入，會回 403。

影響：前端承諾可以操作，後端必定拒絕，形成「按鍵沒做好」的體驗。這一項不是後端缺少路由，也沒有證明越權寫入。

建議：共用角色/狀態權限模型，隱藏或停用不可用操作並說明原因；用 SUPER_ADMIN、AGENT、SUB_ACCOUNT、FROZEN 逐項驗收。

### 7. P2 — H5 場景非同步回呼仍存取已銷毀或不存在的元件

位置：`apps/web/public/games/h5-slot-collection/assets/main/index.9d2e3.js:1`（壓縮檔，以函式及錯誤堆疊定位）。

- 快樂捕魚（14）：`QieHuanScene_normal` 的 preload progress 回呼存取載入節點的 `getComponent`，多次出現 `Cannot read properties of null (reading 'length')`；堆疊落在 main bundle 約第 241417 欄及 Cocos `getComponent`。
- 281、276、278、273、271、269、264：`i18n_spriteByName.ChangeLanguage` 的資源載入回呼，對空的 Sprite 設定 `spriteFrame`，出現 `Cannot set properties of null`；main bundle 約第 1013370 欄。
- 25 個 H5 預期場景均曾載入，但上述場景仍有 pageerror；場景存在與 console 無錯誤是不同驗收條件。

影響：場景切換或語系素材載入時仍有前端例外。捕魚場景在重現時仍看得到，不能據此推定漏派彩、無限射擊或整局故障。

建議：非同步回呼檢查元件與 node 有效性、載入錯誤與場景生命週期；避免以全域吞錯當作修復。補慢素材、切場景、離開重入及語系切換測試。

### 8. P2 — 登入權杖刷新沒有自身逾時，可拖住後續操作

- `apps/web/src/lib/api.ts:62`、`apps/admin/src/lib/adminApi.ts:73` 使用全域 `axios.post` 刷新，而不是設定 15 秒 timeout 的 API instance。
- 全域請求沒有指定 timeout；共用 `refreshInFlight` 一直 pending 時，等待刷新的請求也無法繼續。

這項以程式碼確認，尚未做完整斷網瀏覽器重現。影響條件是刷新請求長時間未完成，不能把一般 API 的 15 秒設定當作此流程已有保護。

建議：刷新請求也要有明確 deadline、可釋放的 in-flight 狀態及使用者可理解的恢復流程。

## 本輪驗證與限制

### 程式與部署

- 本地 HEAD 與遠端 main 均為 `e461ebed93aa5716125f9e92dd1c07aca02d273d`。
- 金寶寶 Web / API 執行部署為該 commit，均 SUCCESS。
- 金寶寶代理後台執行 `de83151b` 的成功部署；之後未修改 admin 的提交被跳過，並非部署失敗。
- 本輪只讀取這三個金寶寶服務；沒有操作其他舊平台服務。

### 自動化

- Server：54 個測試檔、501 項測試通過。
- Provably-fair：16 個測試檔、248 項測試通過。
- Web：15 個測試腳本通過，包括 CSP、adapter、資源及畫質保護檢查。
- Admin：2 個測試腳本通過；靜態掃描辨識 78 個 API 呼叫、83 個後端路由、133 個按鈕、10 個表單。
- Web / Admin / Server typecheck 通過。
- 本機 Node 20.19.2，低於專案要求的 22.13；有 engine warning。正式環境為 Node 22.13.1。這輪未宣稱重新完成所有 production build。

`apps/admin/scripts/test-admin-api-contract.mjs` 主要以正規表示式比對 method/path 及事件 handler 存在。它不會驗證所有 payload、權限、資料庫副作用、交易重試與 UI 成功狀態。**133 個按鈕通過靜態檢查，不等於逐一點擊並完成真實後端驗收。**

### 瀏覽器

使用正式版靜態程式、隔離瀏覽器及攔截的假 API／帳戶；未執行正式投注或轉帳。Chromium + SwiftShader 不等於 iPhone Safari 或 Android 實機。

- 地雷、爬樓梯、骰子、Keno、HiLo、小輪盤、Carnival、Plinko、Hotline、水果拉霸、雷神拉霸、Wheel、Rocket、Blackjack 與 Blackjack table 2：正常 idle 頁面完成檢查，無本輪收集到的 pageerror；另外對地雷/爬樓梯做了上述失敗注入。
- H5：25 個預期場景均曾建立並產生影格；8 款有上述前端例外。部分遊戲仍停留在原版「開始」封面，不能當作已完成下注、動畫與結算驗收。
- 另巡檢 33 個本地牌桌/衍生遊戲入口，包括牌九、牌官、拉霸衍生版、Crash 衍生版與 Plinko X。多數可見 idle 介面，但部分仍在載入中或遇到瀏覽器導航/截圖逾時；未將工具逾時直接判定為正式程式 bug，也未將未完成項目列為通過。
- 賽特：初始 API 假回應使用實際 service 產生，但完整進場未通過；曾停在載入畫面，等待後出現重載提示。另一次仍有素材請求 pending。尚不能排除測試環境/網路因素，**不列為正式賽特已正常，也不宣稱已定位正式黑屏根因**。
- 雷神 II：看到原版開始封面；未完成真實投注驗收。
- 水果機：收到 session/ready 訊息，但截圖仍黑畫面；尚未釐清隔離環境、登入切場或繪圖原因，不列為已正常遊玩。

目前 H5 `visual-ready` 以 scene name 判斷（`yachiyo-adapter.js:739`），水果機 `ready` 在 session 資料返回時發送（`fruit-mary-adapter.js:366`）。這些訊號不能單獨證明盤面、操作與完整結算已就緒。

### 正式環境只讀觀察

- 約台灣時間 12:32 查詢過去 6 小時的三服務日誌，所查 error/warn 與 HTTP 樣本沒有持續 runtime 崩潰或 5xx；有瀏覽器取消請求及圖示/掃描路徑 404。
- API metrics 實際窗口約台灣時間 06:55–12:32，只有 31 個請求；全為 2xx，p50 72 ms，p95/p99 110 ms。
- 樣本很少，不能推論會員尖峰效能、每款遊戲結算延遲或與改版前相比已降低多少延遲。
- 未查到錯誤日誌，不等於第 1–8 項不存在；多項問題不一定產生後端 5xx。

## 建議下一輪放行條件

1. 優先修正 P1：帳目守恆、轉帳冪等/成功識別、session 撤銷、無盤面不得開局、未知開局結果恢復。
2. 建立正式相同版本的可重設測試環境，用真實 Fastify、PostgreSQL 與受控測試帳戶跑端到端，不只使用 mock。
3. 每個會員可見遊戲驗證：進場可見 → 投注/操作 → 結算 → 回大廳餘額一致 → 重新進入；加上零餘額、小數餘額、逾時、連點、切背景及中途離開。
4. 賽特另外重播男女角技能、分裂球、倍率、免遊完整序列；捕魚驗證扣點不足、併發射擊、停射、離開結算及控制設定實際生效。這輪沒有足夠證據宣稱它們全部正確。
5. 後台逐角色測每個按鈕的 API、payload、回應、畫面狀態及實際資料變化；控制系統需涵蓋啟用、停用、刪除、例外線、權限、快取生效與稽核。
6. 使用實體 iPhone/Android 冷載入及慢網路測試，記錄 click-to-response、click-to-board、結算與回大廳同步延遲，再決定是否達到上線標準。
