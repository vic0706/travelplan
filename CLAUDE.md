# CLAUDE.md

回答時請使用繁體中文。

**travelplan** 是一個旅遊行程規劃 PWA：React 前端 + Cloudflare Workers 後端 + D1 資料庫，支援離線（Dexie/IndexedDB）。

> 本檔案是本專案的**唯一權威文件**（single source of truth）。所有架構知識、
> 不變量、歷史 bug 根因都記錄在這裡，不另設其他文件，避免版本落差。
> **每個 session 結束前，若你修了 bug 或改了架構，必須依最下方
> 「文件維護制度」更新本檔案。**

## 技術棧與指令

- 前端：React 19 + TypeScript + Vite + Tailwind 4 + framer-motion + @dnd-kit（拖曳）
- 後端：Hono（跑在 Cloudflare Workers，進入點 `src/worker.ts`）
- 資料庫：Cloudflare D1（SQLite）；離線快取：Dexie（`src/db.ts`）
- 狀態：zustand（`src/store.ts`）

```bash
npm install
npm run dev      # 開發伺服器
npm run build    # 建置（改完程式碼必跑，等同型別檢查）
npm run lint     # tsc --noEmit
npm run deploy   # build + wrangler deploy（除非使用者要求，不要執行）
```

沒有自動化測試。驗證手段 = `npm run build` + 下方「驗證清單」的人工推演。

## 架構地圖

```
src/worker.ts              Workers 進入點，掛載 /api/* 路由
src/routes/trips.ts        行程 CRUD、活動 CRUD、reorder 端點（排程系統核心）
src/routes/bookings.ts     預訂 CRUD + 自動產生行程卡片（generateItineraryItems）
src/utils/optimizer.ts     自動排程器 optimizeDailyItinerary / geminiOptimizeDay
src/pages/TripDetails/     index.tsx（資料流中樞、handleReorder）、ItineraryTab.tsx（拖曳）
src/components/cards/ItineraryCard.tsx   行程卡片（含交通時間顯示、子活動 overlay）
src/components/forms/BookingForm.tsx     預訂表單（各類別的地址/座標輸入）
src/components/forms/ItineraryForm.tsx   活動表單（含子活動編輯 modal）
src/components/inputs/AddressSearchInput.tsx  地址搜尋，onPlaceSelect 回傳 PlaceResult
src/hooks/useTripData.ts   refreshTripData：API → Dexie 全量同步
migrations/                D1 遷移檔；schema.sql 是完整 schema 的鏡像，兩邊要同步改
```

前端資料流：API 是真相來源 → `refreshTripData()` 寫入 Dexie → UI 用
`useLiveQuery` 讀 Dexie。**任何後端寫入後，前端都要呼叫 `refreshTripData()`
才會看到結果。**

## 資料模型：關鍵欄位（Itineraries 表）

| 欄位 | 意義 | 注意 |
|---|---|---|
| `is_time_fixed` | 1 = 固定時間錨點（鎖定）；0 = 智慧卡片（可被排程器移動） | INTEGER，判斷一律用 truthy（`!!v`），**禁止 `=== 1`**（D1 型別不穩定） |
| `stay_duration` | 停留分鐘數，**TEXT 型別**（歷史包袱） | 讀取要 `parseInt`；注意 `parseInt('0') \|\| 60` 會變 60 的陷阱 |
| `display_order` | 當日排序（拖曳用），可為 NULL | 排序一律 `COALESCE(display_order, 9999)` 再 `start_time` |
| `start_time`/`end_time` | `HH:MM` 字串 | 智慧卡片的時間由排程器填寫，可為空 |
| `backup_for_id` | 指向主活動 id = 此卡是備案 | 排程器必須排除備案（不占時間軸） |
| `related_id` | 指向 Bookings.id = 此卡由預訂自動產生 | 預訂更新時整批刪除重建 |
| `sub_items` | 子活動 JSON 陣列（title/notes/duration/start_time/end_time/next_walk_mins…） | 無獨立資料表 |
| `lat`/`lng` + `arrival_lat`/`arrival_lng` | 起點／終點座標 | arrival 欄位來自 migration 0006/0007，寫入要 try/catch 容錯 |
| `next_transport_mode/_time/_auto_time` | 到下一站的交通：手動值 / 自動計算值 | 顯示優先序見下方鐵則 4 |

Bookings 表也有 `lat`/`lng`/`arrival_lat`/`arrival_lng`（migration 0007）。

## 智慧排程系統：五條鐵則

這是本專案最容易壞、也最常被使用者回報的子系統。改任何相關程式前先讀完。

1. **動了固定錨點，就必須重跑排程器。** 任何操作只要新增、刪除、改時間了
   `is_time_fixed=1` 的卡片（含預訂自動產生的卡片），完成後必須對**每個受影響
   日期**呼叫 `optimizeDailyItinerary(c.env, Number(tripId), dateStr)`，否則智慧
   卡片會停留在舊時間造成「行程時間重疊」。
   **簽名注意**：第一個參數是**整個 env**（函式內部用 `env.DB.prepare`），
   不是 `c.env.DB`；tripId 是 number，路由參數是 string 要 `Number()` 轉換。
   目前已遵守此鐵則的位置：
   - `trips.ts` reorder 端點（拖曳後）
   - `bookings.ts` POST 與 PUT（`generateItineraryItems` 之後，用 `affectedDates(b)` 算日期）
   - 新增任何會動到錨點的端點時，照抄這個模式。

2. **`is_time_fixed` 判斷一律 truthy。** `!!i.is_time_fixed` 分固定、
   `!i.is_time_fixed && !i.backup_for_id` 分智慧。D1 回傳型別不保證是
   integer，`=== 1` 曾造成 check-in 卡被當成智慧卡片而被排程器改時間。

3. **所有 `onPlaceSelect` 都必須存座標。** `AddressSearchInput` 的
   `onPlaceSelect(place)` 提供 `{ address, lat, lng, google_place_id, name,
   image_url }`。新增任何地址輸入時，至少要把 `lat`/`lng`（出發點）或
   `arrival_lat`/`arrival_lng`（目的地）寫進 formData。寫 `_place => {}`
   丟棄資料是歷史 bug 來源（RENTAL/TRAIN 等類別曾全部沒存座標）。

4. **交通時間顯示優先序**（`ItineraryCard.tsx`）：
   `manualVal（手動）> autoVal（排程器算的）> haversineEst（前端直線估算，顯示 ~ 前綴）> '自動'`。
   卡片有**兩條底部列**（有照片的 overlay 版、無照片版），**兩處邏輯必須一致**，
   改一處必改另一處（曾因漏改造成「有時顯示估時、有時顯示自動」）。

5. **預訂產生的卡片，`stay_duration` 必須等於實際時長。** `bookings.ts` 的
   `insertItinerary` 用 `timeDiffMins(start_time, end_time)` 計算，不可寫死
   `'0'`（`parseInt('0') || 60` 會讓排程器誤用 60 分鐘）。

6. **禁止空的 `catch {}` 包關鍵步驟。** 至少要 `console.error`。曾有一次
   optimizer 呼叫因參數傳錯（傳了 `c.env.DB` 而非 `c.env`）直接 throw，
   被空 catch 靜默吞掉，「修復」實際上完全沒生效卻看起來成功。
   例外：寫入「可能還沒跑遷移的欄位」的 graceful fallback 可以靜默。

## 排程系統資料流（改 bug 前先對照這張圖）

```
使用者拖曳卡片
  → ItineraryTab.handleDragEnd → arrayMove → index.tsx handleReorder
  → PATCH /api/trips/:id/itineraries/reorder
      固定卡片：只更新 display_order
      智慧卡片：清空 start/end_time + 更新 display_order
      最後：optimizeDailyItinerary(每個受影響日期)
  → 前端 refreshTripData()

使用者建立/編輯預訂
  → POST/PUT /api/trips/:id/bookings
      UPDATE Bookings（含 lat/lng/arrival_*，try/catch 容錯）
      DELETE Itineraries WHERE related_id=bookingId（PUT 才有）
      generateItineraryItems（產生 is_time_fixed=1 卡片，含正確 stay_duration、座標、display_order）
      optimizeDailyItinerary(affectedDates(b))   ← 鐵則 1
  → 前端 refreshTripData()

optimizeDailyItinerary（optimizer.ts）
  讀當日全部卡片 → 分固定（truthy）/智慧（非固定且非備案）
  → 智慧卡片依 display_order 塞進固定錨點之間的空檔
  → 寫回 start/end_time 與 next_transport_auto_time
```

## 病歷庫（歷史 bug 根因，遇到類似症狀先查這裡）

| 症狀 | 根因 | 修法 |
|---|---|---|
| check-in 儲存 18:00–18:30，拖曳後變 18:00–19:00 | optimizer 用 `=== 1` 判斷 is_time_fixed 失敗，固定卡被當智慧卡；且 stay_duration 寫死 '0' → fallback 60 分 | 鐵則 2 + 鐵則 5 |
| 交通「自動」有時顯示 ~X分、有時顯示「自動」 | haversineEst 只加在有照片的底部列，無照片版漏改 | 鐵則 4：兩條底部列同步 |
| 編輯預訂時間後，卡片與鄰近智慧卡片時間重疊（⚠️ 行程時間重疊） | bookings PUT 重建錨點後沒有重跑排程器 | 鐵則 1 |
| 某些預訂類別（租車/火車/接送）的卡片永遠沒有交通估時 | 表單 onPlaceSelect 寫成 `_place => {}` 丟棄座標 | 鐵則 3 |
| 子活動編輯儲存後 start/end_time 被清空 | ItineraryForm 儲存時非固定模式硬寫 `''`，未保留原值 | 非固定模式用 `editingSubItem?.start_time ?? ''` |
| 加了 optimizer 呼叫但行為完全沒變 | 傳參錯誤（`c.env.DB` 而非 `c.env`）throw 後被空 `catch {}` 吞掉 | 鐵則 1 簽名 + 鐵則 6 |

補充：修完後端欄位問題（座標、stay_duration）後，**既有的舊資料不會自動修復**，
需要提醒使用者重新儲存該筆預訂/活動才會回填。

## 耦合清單（改 A 必須跟著改 B）

- `ItineraryCard.tsx` 有照片底部列 ↔ 無照片底部列：交通顯示邏輯完全相同。
- `bookings.ts` `insertItinerary` 的 INSERT 欄位清單 ↔ `.bind()` 參數順序：
  加欄位時兩邊一起改，順序錯了不會報錯、只會存錯欄位。
- `migrations/*.sql` ↔ `schema.sql`：新遷移的變更要同步反映到 schema.sql。
- 新增遷移欄位的寫入程式 → 用 try/catch 包（線上 DB 可能還沒跑該遷移）。
- `optimizeDailyItinerary` 與 `geminiOptimizeDay` 的固定/智慧分類邏輯：兩個函式都要改。
- 後端任何寫入 → 前端對應操作後要 `refreshTripData()`。

## 驗證清單（提交前逐項推演）

1. `npm run build` 通過（唯一的自動化防線）。
2. 若改了排程相關程式，推演這條劇情：「一張固定 check-in 卡 + 一張智慧餐廳卡，
   使用者①拖曳排序②編輯預訂把 check-in 延後半小時」——兩步之後餐廳卡時間
   是否被重新排開、不重疊？
3. 若改了 `ItineraryCard.tsx`，檢查有照片/無照片兩條底部列是否同步。
4. 若改了表單，檢查每個 `onPlaceSelect` 是否存了座標。
5. 若加了 DB 欄位，檢查 INSERT/bind 順序、schema.sql、try/catch 容錯。

## Git 慣例

- `main` 為穩定分支；開發用 `claude/*` 分支，`git push -u origin <branch>`。
- 不主動開 PR、不主動 deploy，除非使用者要求。
- Commit 訊息用英文 `fix:`/`feat:` 前綴 + 說明根因，內容使用者看得懂為準。

## 文件維護制度（每個 session 必守）

1. **修了 bug** → 在「病歷庫」加一列：症狀、根因、修法（一列就好）。
2. **發現新的不變量**（「原來這裡一定要這樣做」）→ 加進「鐵則」或「耦合清單」。
3. **改了架構／資料流** → 更新「架構地圖」與資料流圖。
4. 所有更新**直接寫進本檔案**，不要另開新文件；保持每節精簡，過時內容刪除。
5. 更新本檔案的 commit 與程式碼修改一起提交，不要分開。
