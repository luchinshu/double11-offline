# 部署說明（GitHub Pages + Google Apps Script）

## 一、Google Apps Script（寫入試算表）

1. 開啟「盧琴樹 雙11抽獎 名單」試算表（建議與線上表單共用同一本），
   點「擴充功能」→「Apps Script」。
2. 刪掉預設內容，把本目錄 `Code.gs` 全文貼上，儲存（專案名稱自取，例如 `double11-offline`）。
3. 右上角「部署」→「新增部署」→ 類型選「Web 應用程式」：
   - 說明：雙11線下抽獎
   - 執行身份：**我**（以你的 Google 帳號執行）
   - 存取：**所有人**（讓門市手機匿名提交）
4. 按「部署」→ 授權（允許讀寫試算表）。
5. 複製「Web 應用程式網址」（`https://script.google.com/macros/s/xxxx/exec`）。
6. 把網址帶給門市，兩種方式擇一：
   - **推薦**：加在 QR 碼網址的 `?endpoint=` 參數後面，各門市不用改檔案；
   - 或直接填進 `config.js` 的 `GAS_ENDPOINT`。

> 若是「獨立指令碼」（沒有綁試算表）：在 Apps Script「專案設定」→「指令碼屬性」
> 新增 `SHEET_ID` = 目標試算表 ID，`Code.gs` 會自動改用 `openById`。

## 二、GitHub Pages（門市掃碼頁面）

1. 把本目錄全部檔案推到 GitHub 儲存庫 `double11-offline`。
2. 儲存庫「Settings」→「Pages」→ Source 選 `main` 分支根目錄 → Save。
3. 等 1–2 分鐘，門市網址即為 `https://<帳號>.github.io/double11-offline/`。
4. 用 `make_qr.py` 產生門市 QR 碼（或直接用 GitHub Pages 網址產生）。

## 三、各門市不同貼文／店名

同一個頁面，用網址參數分門市，不用改程式：

```
https://<帳號>.github.io/double11-offline/?store=誠品台茂店&fb=<FB貼文網址>&ig=<IG貼文網址>&endpoint=<GAS網址>
```

- `?store=` 門市名稱（寫進試算表「門市」欄）
- `?fb=`、`?ig=` 該門市被指定留言的活動貼文
- `?endpoint=` GAS Web App 網址

## 四、上線前檢查清單

- [ ] `config.js` 預設貼文網址已改成正式貼文（或所有 QR 碼都有帶 `?fb=` `?ig=`）
- [ ] GAS 已部署、存取權限為「所有人」，且已實際送一筆測試資料進「線下登記」分頁
- [ ] 測試資料重送一次會出現「重複：發票／電話／Email」標記
- [ ] 手機實掃 QR 碼：送出 → 成功畫面 → 3 秒跳轉貼文
- [ ] `index.html` 個資聲明中的【聯絡 Email 待填寫】已換成正式信箱
