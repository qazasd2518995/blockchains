# 金寶寶代理後台操作按鍵檢查

> 本文為專項修正時的記錄；其後整合、轉帳防重送與發布資訊見 [修正交付記錄](2026-09-05-release-fixes.md)。

日期：2026-09-05。範圍：控制頁、代理／會員／子帳號管理、公告、共用表單與 API 操作防護。

## 已修正

1. **停用與刪除分開**：六類控制規則共用操作元件；停用只送停用請求並保留資料，刪除需要獨立確認視窗，顯示種類、目標與 ID。取消不送 DELETE。避免原先同位置的行內確認按鈕被連點誤觸。
2. **重複送出與處理中關閉**：新增同步鎖，保護控制、公告、帳號狀態、新增帳號、備註、密碼、退水、限紅、轉帳等表單。請求中停用表單與關閉按鍵，Escape／背景點擊也不會關掉仍在處理的視窗。
3. **已完成規則不假啟用**：入金與舊版輸贏控制已完成時，前端明確顯示「已完成」，後端亦拒絕重新啟用，不重設已結算進度。手動本金路徑仍使用原有專用 reactivate 流程。
4. **舊資料可管理**：超管的「既有控制規則管理」只在有紀錄時顯示舊控制列表與相應操作；不新增已停用類型的建立入口，也未修改控制引擎的啟用範圍。
5. **寫入成功與刷新失敗分開**：控制操作先反映已提交的狀態，再刷新列表；讀取失敗明確提示不要重送。舊的讀取回應不能覆蓋較新的操作。新增控制成功後也有獨立提示。
6. **稽核與控制修改一致**：五類控制 toggle／delete 的資料變更和稽核改為同一交易。稽核失敗時回滾，避免已改資料卻回報失敗。單筆手動路徑原已有交易，保留。
7. **權限一致**：唯讀子帳號、凍結帳號的管理操作停用，API 用戶端亦攔截非認證類寫入；側欄控制入口與路由權限一致。後端權限仍是最終防線，未擴大代理操作範圍。
8. **查找與輸入錯誤清楚顯示**：帳號搜尋失敗不再顯示為「沒有匹配帳號」，增加重試；修正部分錯誤被 Axios 通用訊息遮住的問題。補上金額精度、百分比、整數時間與公告日期先後驗證。
9. **子帳號目標清除**：清除所選代理時同步清除 ID／列表／名稱並停用新增，不會因登入資料背景刷新又自動選回原代理。
10. **轉帳提示避免誤導**：POST 已成功但後續餘額 GET 失敗，顯示「轉帳已完成」並禁止同一視窗再送；POST 斷線或 5xx 結果不明，要求先查轉帳紀錄及雙方餘額，不自動重試。尚未送出轉帳前的餘額載入失敗，不會誤報轉帳結果不明。
11. **手機操作欄**：表格操作欄固定於右側，啟用／停用與刪除按鍵維持分離、不換成直排小字。

## 控制按鍵對應

| 類型 | 停用／啟用 | 刪除 |
| --- | --- | --- |
| 手動本金路徑 | POST manual-detection/deactivate `{ id }`／POST manual-detection/:id/reactivate | DELETE manual-detection/:id |
| 入金、線上獎勵 | PATCH deposit/:id/toggle `{ isActive }` | DELETE deposit/:id |
| 爆分 | PATCH burst/:id/toggle | DELETE burst/:id |
| 舊版輸贏 | PATCH win-loss/:id/toggle | DELETE win-loss/:id |
| 舊版會員上限 | PATCH win-cap/:id/toggle | DELETE win-cap/:id |
| 舊版代理線上限 | PATCH agent-line/:id/toggle | DELETE agent-line/:id |

以上路徑均以 `/api/admin/controls` 為前綴；未授權操作仍須由後端拒絕。

## 驗證

- `pnpm --filter @bg/admin test` 通過：靜態掃描 77 個 API 呼叫、83 條伺服器路由、120 個原生按鍵、10 個表單。這是結構及路由對照，不等於 120 個按鍵全部完成端到端驗收。
- `apps/admin/scripts/test-admin-actions-browser.mjs`：桌機 1280×900 與手機模擬 390×844 各 31 項情境通過，每輪 38 次隔離測試寫入。實際載入本機 React 元件，驗證連點、取消／確認刪除、處理中關閉、API 失敗、刷新失敗、表單提交、權限與轉帳斷線；無未處理頁面例外。
- `pnpm --filter @bg/server exec vitest run src/modules/admin/controls`：5 個檔案、80 項通過，其中新增 44 項使用完整 Fastify admin 路由／權限 hook 的請求流程測試，覆蓋六類停用／刪除、啟用、權限、完成狀態與稽核失敗回滾。
- 金寶寶 realm 正式格式建置通過（`VITE_ADMIN_REALM=qmoney VITE_API_REALM=qmoney`），包含 TypeScript 檢查及輸出資源隔離驗證；server typecheck 通過。
- `git diff --check` 通過。

## 邊界與交付狀態

- 瀏覽器使用隔離 API fixtures；後端請求測試使用記憶體交易替身，沒有連正式 PostgreSQL。手機為 Chromium 視窗／觸控模擬，不是 iPhone Safari 或 Android 實機。
- 未測正式網站、未讀正式日誌、未修改正式帳號／規則／餘額，沒有推送或部署。不可據此宣稱正式環境已套用或整個平台零 bug。
- 本輪是按鍵及相關 API 流程修正，不是所有遊戲玩法、控制成效、財務結算的完整驗證。轉帳跨視窗／重新登入後的全域冪等性、金融後端所有交易邊界、單筆操作以外的批量控制操作，未在本輪全面驗證。
- 本機 Node 20.19.2，專案要求至少 22.13.0，命令有引擎版本警告；部署應使用專案指定版本再由 CI 驗證。
- 保留工作區先前水果機、賽特、牌桌等既有修改；本輪沒有更動遊戲美術、動畫、RTP 或派彩公式。

## 重跑瀏覽器測試

先啟動本機金寶寶管理前端，再執行：

```sh
ADMIN_TEST_URL=http://127.0.0.1:5190 pnpm --filter @bg/admin test:actions:browser
ADMIN_TEST_MOBILE=1 ADMIN_TEST_URL=http://127.0.0.1:5190 pnpm --filter @bg/admin test:actions:browser
```

需有可用的 Playwright／Chromium；也可透過 `PLAYWRIGHT_MODULE` 指定已安裝模組，並以 `BROWSER_CDP_URL` 連接 agent-browser 的本機瀏覽器。腳本拒絕非本機前端 URL，攔截測試 API，阻擋非本機網路請求。
