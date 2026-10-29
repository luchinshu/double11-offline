/**
 * 盧琴樹 LUCHINSHU（鷹速國際）雙11 抽獎 — Google Apps Script Web App
 *
 * 功能：表單（index.html）送出後，以 POST 寫入試算表「線下登記」分頁。
 *  線下門市：發票必填（2 碼英文＋8 碼數字），訂單編號留白。
 *  線上訂單：不收發票（留白），改必填購買通路（官網／蝦皮／momo）與訂單編號。
 *  - 自動建立分頁；舊表頭保留，缺的欄位補在後面（通路類型、購買通路、訂單編號）
 *  - 伺服器端驗證與前端 validate.js 同一套規則
 *  - 重複比對：電話、Email、有填的發票、有填的訂單編號（訂單編號 trim 後轉大寫）
 *
 * 改版後請用「管理部署」更新現有 Web App 版本（網址不變就不用改 GAS_ENDPOINT）。
 * 部署方式詳見 DEPLOY.md。
 */

var SHEET_NAME = '線下登記';
var HARDCODED_SHEET_ID = '1xFeTyFWZh_8bd2GVP0-G28TJBrl1vGrmXHuwI0HWe7M';
// 既有欄位順序不動；新欄位接在後面，避免洗掉已寫入的列。
var HEADERS = ['提交時間', '姓名', 'Email', '電話', '消費金額', '平台', '帳號名稱', '發票號碼', '行銷同意', '門市', '來源', '重複標記', '通路類型', '購買通路', '訂單編號'];

var INVOICE_RE = /^[A-Za-z]{2}-?[0-9]{8}$/;
var ORDER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9\-_]{3,39}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var PHONE_RE = /^[0-9+\-\s()]{8,15}$/;

// 若用獨立指令碼（未綁定試算表），在「指令碼屬性」設定 SHEET_ID 即可
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID') || HARDCODED_SHEET_ID;
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
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

    var channel = channelOf_(data);
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    var col = ensureHeader_(sh);
    var idx = col.idx;

    var normInv = channel === 'store' ? normInvoice_(data.invoice) : '';
    var normOrder = channel === 'online' ? normOrderId_(data.orderId) : '';
    var normPh = normPhone_(data.phone);
    var normEm = String(data.email).trim().toLowerCase();
    var dup = findDuplicate_(sh, idx, normInv, normPh, normEm, normOrder);
    var row = buildRow_(col.names, idx, data, channel, dup);

    sh.appendRow(row);
    SpreadsheetApp.flush();
    return json_({ ok: true, duplicate: !!dup, channel: channel });
  } catch (err) {
    return json_({ ok: false, errors: ['伺服器錯誤：' + err.message] });
  }
}

// ---- 通路 ---------------------------------------------------------------
/** 'store' | 'online' | ''。舊版只送發票、source=offline-web 的仍視為門市。 */
function channelOf_(d) {
  var c = String(d.channel || d.channelType || '').trim();
  var cl = c.toLowerCase();
  if (cl === 'online' || c === '線上' || c === '線上訂單') return 'online';
  if (cl === 'store' || cl === 'offline' || c === '門市' || c === '線下' || c === '線下門市') return 'store';
  var src = String(d.source || '').trim().toLowerCase();
  if (src === 'online-web' || src === 'online') return 'online';
  if (src === 'offline-web' || src === 'offline' || src === 'store') return 'store';
  if (String(d.invoice || '').trim() && !String(d.orderId || '').trim() && !String(d.orderChannel || '').trim()) return 'store';
  return '';
}

/** 依表頭名稱寫一列。線上發票留白、門市訂單編號留白。缺欄就略過，不搬動舊欄。 */
function buildRow_(names, idx, data, channel, dup) {
  var amount = Number(String(data.amount != null ? data.amount : '').replace(/,/g, ''));
  var row = blankRow_(names.length);
  put_(row, idx, '提交時間', new Date());
  put_(row, idx, '姓名', String(data.name).trim());
  put_(row, idx, 'Email', String(data.email).trim().toLowerCase());
  put_(row, idx, '電話', String(data.phone).trim());
  put_(row, idx, '消費金額', amount);
  put_(row, idx, '平台', String(data.platform).toUpperCase() === 'FB' ? 'FB' : 'IG');
  put_(row, idx, '帳號名稱', String(data.account).trim());
  put_(row, idx, '發票號碼', channel === 'store' ? String(data.invoice || '').trim() : '');
  put_(row, idx, '行銷同意', data.marketing === true || String(data.marketing) === 'true' ? '同意' : '');
  put_(row, idx, '門市', channel === 'store' ? String(data.store || '').trim() : '');
  put_(row, idx, '來源', sourceOf_(data, channel));
  put_(row, idx, '重複標記', dup ? '重複：' + dup : '');
  put_(row, idx, '通路類型', channel === 'online' ? '線上' : '門市');
  put_(row, idx, '購買通路', channel === 'online' ? canonicalOrderChannel_(data.orderChannel) : '');
  put_(row, idx, '訂單編號', channel === 'online' ? String(data.orderId || '').trim() : '');
  return row;
}

/** 舊表頭保留原位，缺的標準欄補在最後。 */
function mergeHeaders_(existing) {
  var names = [];
  for (var i = 0; i < (existing || []).length; i++) names.push(String(existing[i] || '').trim());
  while (names.length && !names[names.length - 1]) names.pop();
  if (!names.length || names[0] !== '提交時間') return HEADERS.slice();
  for (var h = 0; h < HEADERS.length; h++) {
    if (names.indexOf(HEADERS[h]) === -1) names.push(HEADERS[h]);
  }
  return names;
}

function sourceOf_(d, channel) {
  var s = String(d.source || '').trim();
  if (s) return s;
  return channel === 'online' ? 'online-web' : 'offline-web';
}

function canonicalOrderChannel_(v) {
  var t = String(v || '').trim();
  if (t === '官網') return '官網';
  if (t === '蝦皮') return '蝦皮';
  if (t.toLowerCase() === 'momo') return 'momo';
  return '';
}

function isValidOrderId_(v) {
  var t = String(v || '').trim();
  return ORDER_ID_RE.test(t) && /[0-9]/.test(t);
}

// ---- 伺服器端驗證（與前端 validate.js 同一套規則）----------------------
function validate_(d) {
  var errors = [];
  if (!d || typeof d !== 'object') return ['資料格式錯誤'];
  var channel = channelOf_(d);
  if (!String(d.name || '').trim()) errors.push('姓名必填');
  if (!EMAIL_RE.test(String(d.email || '').trim())) errors.push('Email 格式錯誤');
  if (!PHONE_RE.test(String(d.phone || '').trim())) errors.push('電話格式錯誤');
  var amt = Number(String(d.amount != null ? d.amount : '').replace(/,/g, ''));
  if (isNaN(amt) || !isFinite(amt) || amt <= 0) errors.push('消費金額須為大於 0 的數字');
  var p = String(d.platform || '').toUpperCase();
  if (p !== 'FB' && p !== 'IG') errors.push('平台須為 FB 或 IG');
  if (!String(d.account || '').trim()) errors.push('帳號名稱必填');
  if (!channel) errors.push('請選擇線下門市或線上訂單');
  else if (channel === 'store') {
    if (!INVOICE_RE.test(String(d.invoice || '').trim())) errors.push('發票號碼格式錯誤（2 碼英文＋8 碼數字）');
  } else {
    if (!canonicalOrderChannel_(d.orderChannel)) errors.push('購買通路須為官網、蝦皮或 momo');
    if (!isValidOrderId_(d.orderId)) errors.push('訂單編號格式錯誤（4 碼以上英數，且要有數字）');
  }
  if (d.privacyConsent !== true && String(d.privacyConsent) !== 'true') errors.push('未同意個資聲明');
  return errors;
}

// ---- 正規化（與 validate.js / merge.py 一致，三方比對結果才會相同）----
function normInvoice_(v) {
  return String(v || '').trim().toUpperCase().replace(/-/g, '');
}
function normOrderId_(v) {
  return String(v || '').trim().toUpperCase();
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
function headerIndex_(names) {
  var idx = {};
  for (var i = 0; i < names.length; i++) {
    if (names[i]) idx[names[i]] = i;
  }
  return { names: names, idx: idx };
}

/**
 * 表頭是「提交時間」就只補缺欄，不搬動舊欄。
 * 空白分頁則寫入完整表頭。
 */
function ensureHeader_(sh) {
  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastRow < 1 || lastCol < 1) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return headerIndex_(HEADERS);
  }
  var width = Math.max(lastCol, HEADERS.length);
  var first = sh.getRange(1, 1, 1, width).getValues()[0];
  var names = [];
  for (var i = 0; i < lastCol; i++) names.push(String(first[i] || '').trim());
  while (names.length && !names[names.length - 1]) names.pop();

  // 還沒有我們的表頭（空白或只有一列雜訊）就整列寫上。已有資料則只在後面補缺欄。
  if (!names.length || (names[0] !== '提交時間' && lastRow <= 1)) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return headerIndex_(HEADERS);
  }
  var merged = mergeHeaders_(names);
  var changed = merged.length !== names.length;
  if (!changed) {
    for (var c = 0; c < merged.length; c++) {
      if (merged[c] !== names[c]) { changed = true; break; }
    }
  }
  if (changed) {
    sh.getRange(1, 1, 1, merged.length).setValues([merged]);
    sh.setFrozenRows(1);
  }
  return headerIndex_(merged);
}

/** 回傳撞到的鍵（'電話'／'Email'／'發票'／'訂單編號'），沒有重複回傳 ''。空白不算。 */
function findDuplicate_(sh, idx, normInv, normPh, normEm, normOrder) {
  var last = sh.getLastRow();
  if (last < 2) return '';
  var width = Math.max(sh.getLastColumn(), HEADERS.length);
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  function cell(row, name) {
    var i = idx[name];
    if (i == null || i < 0) return '';
    return row[i];
  }
  for (var r = 0; r < values.length; r++) {
    var rowPh = normPhone_(cell(values[r], '電話'));
    var rowEm = String(cell(values[r], 'Email') || '').trim().toLowerCase();
    var rowInv = normInvoice_(cell(values[r], '發票號碼'));
    var rowOrder = normOrderId_(cell(values[r], '訂單編號'));
    if (normPh && rowPh && rowPh === normPh) return '電話';
    if (normEm && rowEm && rowEm === normEm) return 'Email';
    if (normInv && rowInv && rowInv === normInv) return '發票';
    if (normOrder && rowOrder && rowOrder === normOrder) return '訂單編號';
  }
  return '';
}

function blankRow_(n) {
  var row = [];
  for (var i = 0; i < n; i++) row.push('');
  return row;
}
function put_(row, idx, name, val) {
  if (idx[name] == null) return;
  row[idx[name]] = val;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
