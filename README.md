# 盧琴樹 LUCHINSHU（鷹速國際）雙11 線下門市掃碼抽獎

客人先選「線下門市」或「線上訂單」再填資料 → 送出後跳轉活動貼文留言「我要吃糖心酥」→ **有填表＋有留言才算參加**。
門市要填發票；線上訂單不收發票，改填訂單編號（購買通路僅官網；蝦皮／momo 不參加）。
抽獎日把名單與留言比對、再合併去重，產生可驗證的抽獎名單。

- 活動期間：**2026/10/30 – 2026/11/30**
- 抽獎日：**2026/12/9**（中獎以 Email 及 FB／IG 私訊通知）
- 同一位顧客限參加一次，重複登記僅計一筆

## 檔案一覽

| 檔案 | 用途 |
| --- | --- |
| `index.html` / `style.css` / `app.js` / `config.js` | 抽獎表單（手機優先）：先選門市或線上訂單 |
| `validate.js` | 驗證／正規化／比對合併的純函式（瀏覽器＋Node 共用） |
| `admin.html` | 門市管理頁：本機提交紀錄、下載 CSV、清除 |
| `Code.gs` + `DEPLOY.md` | Google Apps Script Web App：寫入試算表「線下登記」分頁（改版後要重新部署） |
| `merge.py` / `merge.html` | 抽獎日名單合併＋可驗證抽籤（Python 與瀏覽器兩種版本） |
| `make_qr.py` / `qr_store.png` | 門市 QR 碼產生器與成品 |
| `test.js` | `node test.js` 跑表單驗證、合併與 Code.gs 驗證 |
| `sample_data/` | 範例 CSV，可實際跑一次 `merge.py` 練習 |


> 視覺：盧琴樹品牌專屬風格（酒紅／金／米白、發光圓月＋金色五線譜、Noto Serif TC 襯線標誌），登記頁與管理頁共用 `style.css`。

## 門市怎麼用（店員版）

1. 印出 `qr_store.png`（或依 `make_qr.py` 自訂門市參數後重新產生），放在櫃台。
2. 客人掃碼 → 填資料 → 勾選個資同意 → 按「送出，帶我去留言！」。
3. 手機會自動跳轉到活動貼文，**提醒客人一定要留言**；沒留言不算參加。
4. 店員可開同一網址後面的 `admin.html`（如 `https://…/double11-offline/admin.html`）：
   - 看本機提交筆數、重複發票筆數；
   - **打烊前按「下載 CSV」**把檔案交回總部（UTF-8 含 BOM，Excel 直接開）；
   - 確認下載後再按「清除本機資料」。
5. 若 QR 碼網址有帶 `?endpoint=`，客人送出時也會同步寫進 Google 試算表
   「線下登記」分頁（有網路就即時入帳；沒網路至少本機與 CSV 留底）。

## 改貼文連結／換門市

同一支程式不用改檔案，用網址參數（詳見 `config.js` 註解）：

```
https://<帳號>.github.io/double11-offline/?store=誠品台茂店&fb=<FB貼文網址>&ig=<IG貼文網址>&endpoint=<GAS網址>
```

- `?fb=` / `?ig=`：客人選哪個平台就跳哪篇貼文；
- `?store=`：門市名稱，會寫進資料裡；
- `?endpoint=`：GAS Web App 網址。
- 要改預設值就編輯 `config.js` 的 `window.LOTTERY_CONFIG`。

## 部署

- **GitHub Pages**：整目錄推到儲存庫 `double11-offline`，Settings → Pages 開 main 根目錄。
- **Google Apps Script**：依 `DEPLOY.md` 步驟部署 Web App（存取設「所有人」），
  網址交給門市放在 `?endpoint=` 或 `config.js`。

## 本地測試

```bash
cd double11-offline
python3 -m http.server 8000        # 開 http://localhost:8000 看表單、admin.html
node test.js                       # 表單、合併、Code.gs 驗證（含呼叫 merge.py）
python3 merge.py --demo --draw 2 --seed demo-seed   # 內建範例跑一遍
python3 merge.py sample_data/offline_form.csv sample_data/fb_comments.csv \
    sample_data/ig_comments.csv --online sample_data/online_form.csv \
    -o canonical.csv --draw 3 --seed 2026-12-09      # 用範例檔案實跑
python3 make_qr.py "https://<帳號>.github.io/double11-offline/?store=大江餐車" qr_dajiang.png
```

## 抽獎日流程（2026/12/9）

1. **收資料**：收集各門市交回的線下 CSV＋試算表「線下登記」匯出，合併成一份線下表單 CSV
   （欄位標頭相同，直接合併或分多次匯入 `merge.html`）。
2. **導出留言名單**：從 FB／IG 活動貼文後台匯出留言者帳號，存成
   `fb_comments.csv`、`ig_comments.csv`（檔名含 fb／ig 會自動判斷平台）。
3. **合併去重**（`merge.py` 或 `merge.html`）：
   - 只保留「有填表**且**有留言」的人（`canonical.rejected.csv` 是被剔除的沒留言名單，可複查）；
   - 合併後，用電話（+886 正規化）／Email（小寫）／發票號碼／訂單編號（有填才比）去重，
     同一人限一次（`canonical.dropped.csv` 記錄剔除原因）。
4. **抽籤**：`--draw 5 --seed <公開種子>`，依 `SHA-256("seed|id")` 由小到大取前 5 名；
   印出 `list_hash` 與完整排序，任何人都能用同一 seed 重算驗證（與 `verify.py` 同風格）。
5. **通知**：依 canonical 名單的 Email 與 FB／IG 帳號聯絡中獎者。

## 個資注意

- 表單內嵌完整個資聲明（同 `double11-lottery/privacy.md`），個資同意為必填、行銷同意為選填。
- 名單含姓名／Email／電話／發票號碼：**CSV 檔案請用加密或受控管道傳遞**，不要丟到公開群組；
  `merge.html` 全部在本機運算，適合不方便把名單交給外部工具的情境。
- 活動結束後依聲明「利用期間至 2028/12/31 止」保存，期滿刪除。

## 待老闆提供事項

- [ ] FB、IG 活動貼文正式網址（填入 QR 碼的 `?fb=` `?ig=` 或 `config.js`）
- [ ] Google Apps Script 部署後的 Web App 網址（`?endpoint=`）
- [ ] 個資聲明中的【聯絡 Email 待填寫】正式信箱（`index.html` 與 `privacy.md`）
- [ ] 各門市 QR 碼是否要印不同店名版本（`make_qr.py` 可各別產生）
- [ ] 獎項內容與名額（抽籤的 `--draw` 數字）
