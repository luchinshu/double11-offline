/**
 * 盧琴樹 LUCHINSHU（鷹速國際）雙11 線下門市掃碼抽獎 — Google Apps Script Web App
 *
 * 功能：門市表單（index.html）送出後，以 POST 寫入試算表「線下登記」分頁。
 *  - 自動建立分頁與欄位標頭、補上伺服器時間戳
 *  - 伺服器端驗證（發票格式、Email、電話、平台…）
 *  - 以「發票號碼（正規化）／電話（正規化）／Email（小寫）」比對舊資料，重複者標記「重複」
 *
 * 部署方式詳見 DEPLOY.md。
 */

var SHEET_NAME = '線下登記';
var HEADERS = ['提交時間', '姓名', 'Email', '電話', '消費金額', '平台', '帳號名稱', '發票號碼', '行銷同意', '門市', '來源', '重複標記'];

var INVOICE_RE = /^[A-Za-z]{2}-?[0-9]{8}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var PHONE_RE = /^[0-9+\-\s()]{8,15}$/;

// 若用獨立指令碼（未綁定試算表），在「指令碼屬性」設定 SHEET_ID 即可
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function doGet() {
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    var errors = validate_(data);
    if (errors.length) {
      return json_({ ok: false, errors: errors });
    }

    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeader_(sh);

    var normInv = normInvoice_(data.invoice);
    var normPh = normPhone_(data.phone);
    var normEm = String(data.email).trim().toLowerCase();
    var dup = findDuplicate_(sh, normInv, normPh, normEm);

    sh.appendRow([
      new Date(),                                        // 提交時間（伺服器時間戳）
      String(data.name).trim(),
      normEm,
      String(data.phone).trim(),
      Number(data.amount),
      String(data.platform).toUpperCase() === 'FB' ? 'FB' : 'IG',
      String(data.account).trim(),
      String(data.invoice).trim(),
      data.marketing === true ? '同意' : '',
      String(data.store || '').trim(),
      String(data.source || 'offline-web').trim(),
      dup ? '重複：' + dup : ''
    ]);

    SpreadsheetApp.flush();
    return json_({ ok: true, duplicate: !!dup });
  } catch (err) {
    return json_({ ok: false, errors: ['伺服器錯誤：' + err.message] });
  }
}

// ---- 伺服器端驗證（與前端 validate.js 同一套規則）----------------------
function validate_(d) {
  var errors = [];
  if (!d || typeof d !== 'object') return ['資料格式錯誤'];
  if (!String(d.name || '').trim()) errors.push('姓名必填');
  if (!EMAIL_RE.test(String(d.email || '').trim())) errors.push('Email 格式錯誤');
  if (!PHONE_RE.test(String(d.phone || '').trim())) errors.push('電話格式錯誤');
  var amt = Number(String(d.amount != null ? d.amount : '').replace(/,/g, ''));
  if (isNaN(amt) || !isFinite(amt) || amt <= 0) errors.push('消費金額須為大於 0 的數字');
  var p = String(d.platform || '').toUpperCase();
  if (p !== 'FB' && p !== 'IG') errors.push('平台須為 FB 或 IG');
  if (!String(d.account || '').trim()) errors.push('帳號名稱必填');
  if (!INVOICE_RE.test(String(d.invoice || '').trim())) errors.push('發票號碼格式錯誤（2 碼英文＋8 碼數字）');
  if (d.privacyConsent !== true && String(d.privacyConsent) !== 'true') errors.push('未同意個資聲明');
  return errors;
}

// ---- 正規化（與 validate.js / merge.py 一致，三方比對結果才會相同）----
function normInvoice_(v) {
  return String(v || '').trim().toUpperCase().replace(/-/g, '');
}
function normPhone_(v) {
  var d = String(v || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.slice(0, 3) === '886') {
    if (d.charAt(3) === '0') return '886' + d.slice(4);
    return d;
  }
  if (d.charAt(0) === '0') return '886' + d.slice(1);
  if (d.length === 9) return '886' + d;
  return d;
}

// ---- 分頁與重複檢查 -----------------------------------------------------
function ensureHeader_(sh) {
  var first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(first[0]) !== HEADERS[0]) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
}

/** 回傳撞到的鍵種類（'發票'／'電話'／'Email'），沒有重複回傳 '' */
function findDuplicate_(sh, normInv, normPh, normEm) {
  var last = sh.getLastRow();
  if (last < 2) return '';
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues(); // C=Email, D=電話, H=發票
  for (var i = 0; i < values.length; i++) {
    var rowInv = normInvoice_(values[i][7]);
    var rowPh = normPhone_(values[i][3]);
    var rowEm = String(values[i][2] || '').trim().toLowerCase();
    if (normInv && rowInv && rowInv === normInv) return '發票';
    if (normPh && rowPh && rowPh === normPh) return '電話';
    if (normEm && rowEm && rowEm === normEm) return 'Email';
  }
  return '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
