/**
 * 盧琴樹 雙11 抽獎 — 驗證、正規化、URL 解析、比對合併（純函式，無 DOM 依賴）
 * 線下門市要發票；線上訂單改要購買通路＋訂單編號（不要求發票）。
 * 同時支援瀏覽器（window.LotteryValidate）與 Node（module.exports），供 test.js 測試。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LotteryValidate = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ---- 正規式（與 Google 表單版一致）------------------------------------
  var INVOICE_RE = /^[A-Z]{2}\d{8}$/;                 // 正規化後：2 碼英文 + 8 碼數字
  var ORDER_ID_RE = /^[A-Z]{2,3}\d{9,11}$/;           // 正規化後：2–3 碼英文 + 9–11 碼數字
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;   // 夠用的 Email 格式
  var WS_RE = /\s+/g;
  var ACCOUNT_URL_PREFIX_RE =
    /^(?:https?:\/\/)?(?:(?:www|m|mobile)\.)?(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me)\//i;

  function str(v) { return v == null ? '' : String(v); }
  function trim(v) { return str(v).trim(); }

  function toHalfWidth(s) {
    return str(s).replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
  }
  function stripSpacesAndDashes(s) {
    return toHalfWidth(s).replace(/[\s\-–—]/g, '');
  }

  // ---- 發票號碼：2 碼英文字母＋8 碼數字；連號與同一數字不收 ----
  function normalizeInvoice(v) {
    return stripSpacesAndDashes(trim(v)).toUpperCase();
  }
  function fakeInvoiceDigits(digits) {
    if (!/^\d{8}$/.test(digits)) return false;
    if (/^(\d)\1{7}$/.test(digits)) return true;
    // AB12345678 是格式範例，也是既有測試的合法發票，不當成連號擋下。
    if (digits === '12345678') return false;
    var asc = true;
    var desc = true;
    for (var i = 1; i < 8; i++) {
      var diff = digits.charCodeAt(i) - digits.charCodeAt(i - 1);
      if (diff !== 1) asc = false;
      if (diff !== -1) desc = false;
    }
    return asc || desc;
  }
  // '' | 'empty' | 'format' | 'fake'
  function invoiceIssue(v) {
    if (!trim(v)) return 'empty';
    var norm = normalizeInvoice(v);
    if (!/^[A-Z]{2}\d{8}$/.test(norm)) return 'format';
    if (fakeInvoiceDigits(norm.slice(2))) return 'fake';
    return '';
  }
  function isValidInvoice(v) {
    return invoiceIssue(v) === '';
  }
  function invoiceAlreadyUsed(list, invoice) {
    var norm = normalizeInvoice(invoice);
    if (!norm) return false;
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      if (normalizeInvoice(list[i]) === norm) return true;
    }
    return false;
  }

  // ---- 訂單編號：2–3 碼英文 + 9–11 碼；尾端 APn 付款編號去掉 ----
  function normalizeOrderId(v) {
    var t = stripSpacesAndDashes(trim(v)).toUpperCase();
    return t.replace(/AP\d+$/, '');
  }
  function isValidOrderId(v) {
    return ORDER_ID_RE.test(normalizeOrderId(v));
  }
  function orderIdIssue(v) {
    if (!trim(v)) return 'empty';
    var norm = normalizeOrderId(v);
    if (/^\d+$/.test(norm)) return 'digits';
    if (!ORDER_ID_RE.test(norm)) return 'format';
    return '';
  }
  function canonicalOrderChannel(v) {
    var t = trim(v);
    // 本次活動線上僅限官網；蝦皮／momo 不參加
    if (t === '官網') return '官網';
    return '';
  }

  // '' | 'store' | 'online'。沒選就回空字串，不默默當成門市。
  function resolveChannel(d) {
    d = d || {};
    var c = trim(d.channel != null ? d.channel : d.channelType);
    var cl = c.toLowerCase();
    if (cl === 'online' || c === '線上' || c === '線上訂單') return 'online';
    if (cl === 'store' || cl === 'offline' || c === '門市' || c === '線下' || c === '線下門市') return 'store';
    return '';
  }

  // ---- Email -------------------------------------------------------------
  function isValidEmail(v) {
    return EMAIL_RE.test(trim(v));
  }
  function normalizeEmail(v) {
    return trim(v).toLowerCase();
  }

  // ---- 電話：只收台灣手機 09xxxxxxxx（可含空白、dash；+886／886／009886 同等）----
  function phoneDigits(v) {
    return str(v).replace(/[^0-9]/g, '');
  }
  // 是台灣手機就回 09xxxxxxxx，否則回 ''。
  function taiwanMobileNational(v) {
    var d = phoneDigits(v);
    if (!d) return '';
    // 台灣撥外碼 002/005/006/007/009 + 886，或 00 + 886
    var idd = ['002886', '005886', '006886', '007886', '009886', '00886'];
    for (var i = 0; i < idd.length; i++) {
      if (d.slice(0, idd[i].length) === idd[i]) {
        d = '886' + d.slice(idd[i].length);
        break;
      }
    }
    if (/^09\d{8}$/.test(d)) return d;
    if (/^88609\d{8}$/.test(d)) return d.slice(3);
    if (/^8869\d{8}$/.test(d)) return '0' + d.slice(3);
    return '';
  }
  function isValidPhone(v) {
    return taiwanMobileNational(v) !== '';
  }
  function normalizePhone(v) {
    var national = taiwanMobileNational(v);
    if (national) return '886' + national.slice(1);
    // 舊名單裡的非手機仍用同一套 886 折法做去重，但不能靠這個通過驗證。
    var d = phoneDigits(v);
    if (!d) return '';
    if (d.slice(0, 3) === '886') {
      if (d.charAt(3) === '0') return '886' + d.slice(4);
      return d;
    }
    if (d.charAt(0) === '0') return '886' + d.slice(1);
    if (d.length === 9) return '886' + d;
    return d;
  }

  // ---- FB / IG 帳號（NFC、去網址前綴、去 @、小寫、去空白）--------------
  function nfc(s) {
    return typeof s.normalize === 'function' ? s.normalize('NFC') : s;
  }
  function normalizeAccount(v) {
    var t = nfc(str(v)).trim().toLowerCase();
    t = t.replace(WS_RE, '');                    // 去所有空白
    t = t.replace(ACCOUNT_URL_PREFIX_RE, '');    // 去網址前綴
    t = t.replace(/^\/+/, '').replace(/\/+$/, ''); // 殘留斜線
    t = t.replace(/^[@＠]+/, '');                // 去開頭 @／全形＠
    return t;
  }

  // ---- 表單驗證 ----------------------------------------------------------
  function validateForm(d, registry) {
    d = d || {};
    registry = registry || {};
    var errors = {};
    var name = trim(d.name);
    var email = trim(d.email);
    var phone = trim(d.phone);
    var amountRaw = trim(d.amount).replace(/,/g, '');
    var amount = Number(amountRaw);
    var platform = trim(d.platform).toUpperCase();
    var account = trim(d.account);
    var invoice = trim(d.invoice);
    var channel = resolveChannel(d);
    var orderId = trim(d.orderId);
    var orderChannel = canonicalOrderChannel(d.orderChannel);

    if (!channel) errors.channel = '請先選一下是線下門市還是線上訂單喔';

    if (!name) errors.name = '請填寫姓名喔';
    else if (name.length > 50) errors.name = '姓名太長了，請確認一下';

    if (!email) errors.email = '請填 Email，中獎通知會寄到這裡';
    else if (!isValidEmail(email)) errors.email = 'Email 格式好像不太對，再檢查一下';

    if (!isValidPhone(phone)) errors.phone = '請填台灣手機，例：0912345678';

    if (amountRaw === '' || isNaN(amount) || !isFinite(amount)) errors.amount = '消費金額請填數字，例：1280';
    else if (amount <= 0) errors.amount = '消費金額要大於 0 喔';

    if (platform !== 'FB' && platform !== 'IG') errors.platform = '請選擇 FB 或 IG 其中一個';

    if (!account) errors.account = '請填寫你的 ' + (platform === 'FB' ? 'FB' : 'FB／IG') + ' 帳號名稱';
    else if (account.length > 100) errors.account = '帳號名稱太長了，請確認一下';

    if (channel === 'store') {
      var invIssue = invoiceIssue(invoice);
      if (invIssue === 'empty') errors.invoice = '請輸入發票號碼';
      else if (invIssue === 'format') errors.invoice = '發票號碼格式錯誤，應為 2 碼英文字母加 8 碼數字（例如 AB12345678）';
      else if (invIssue === 'fake') errors.invoice = '發票號碼無效，請依實際收據填寫';
      else if (invoiceAlreadyUsed(registry.invoices, invoice)) errors.invoice = '此發票號碼已被登錄，每張發票限登錄一次';
    } else if (channel === 'online') {
      if (!orderChannel) errors.orderChannel = '線上訂單僅限官網購買才可參加';
      var orderIssue = orderIdIssue(orderId);
      if (orderIssue === 'empty') errors.orderId = '請輸入訂單編號';
      else if (orderIssue === 'digits') errors.orderId = '請輸入完整訂單編號，需包含英文字母開頭';
      else if (orderIssue === 'format') errors.orderId = '訂單編號格式錯誤，應為 2～3 碼英文開頭加 9～11 位數字';
    }

    if (d.privacyConsent !== true) errors.privacyConsent = '要勾選同意個資聲明才能參加抽獎喔';

    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  // ---- 網址參數與設定解析 ------------------------------------------------
  function parseQueryString(search) {
    var out = {};
    var q = trim(search);
    if (q.charAt(0) === '?') q = q.slice(1);
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? '' : pair.slice(i + 1);
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) { /* 保留原值 */ }
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* 保留原值 */ }
      if (k) out[k] = v;
    });
    return out;
  }

  // 用網址參數覆蓋設定；params 為 parseQueryString 的回傳值
  function resolveConfig(base, params) {
    var cfg = {};
    Object.keys(base || {}).forEach(function (k) { cfg[k] = base[k]; });
    params = params || {};
    var map = { fb: 'FB_POST_URL', ig: 'IG_POST_URL', store: 'STORE_NAME', endpoint: 'GAS_ENDPOINT', fbpage: 'FB_PAGE_URL', igpage: 'IG_PAGE_URL', channel: 'CHANNEL' };
    Object.keys(map).forEach(function (pk) {
      var v = params[pk];
      if (typeof v === 'string' && v.trim()) cfg[map[pk]] = v.trim();
    });
    return cfg;
  }

  // 依使用者選的平台挑貼文網址
  function pickPostUrl(config, platform) {
    return String(platform).toUpperCase() === 'FB' ? config.FB_POST_URL : config.IG_POST_URL;
  }

  // ---- CSV（RFC 4180 簡易版：支援引號、雙引號跳脫、CRLF、BOM）----------
  function parseCsv(text) {
    var t = str(text).replace(/\uFEFF/, ''); // 去 BOM
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (t.charAt(i + 1) === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t.charAt(i + 1) === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // 去掉完全空白的尾列
    while (rows.length && rows[rows.length - 1].every(function (c2) { return c2 === ''; })) rows.pop();
    return rows;
  }

  function csvEscape(v) {
    var s = str(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) {
    return rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n') + '\r\n';
  }

  // ---- 抽獎名單比對與合併 -------------------------------------------------
  function entryAccountNorm(e) {
    return normalizeAccount(e.account != null ? e.account : e['帳號名稱']);
  }
  function entryPlatform(e) {
    var p = str(e.platform != null ? e.platform : e['平台']).toUpperCase();
    return p === 'FB' ? 'FB' : 'IG';
  }
  function buildEntryId(platform, accountNorm) {
    return platform + ':' + accountNorm;
  }

  /**
   * 線下表單 × 留言名單：只保留「有填表單且帳號有留言」的人。
   * commentSets = { FB: [正規化帳號...], IG: [...] }（陣列或 Set 皆可）
   * 比對採聯集：使用者填 FB 但留言在 IG（或相反）也算有留言，
   * 並記錄 matchedPlatform 方便人工抽查；同帳號出現在兩邊不影響。
   */
  function matchOfflineWithComments(entries, commentSets) {
    var sets = {};
    ['FB', 'IG'].forEach(function (p) {
      var s = commentSets[p];
      sets[p] = s instanceof Set ? s : new Set(s || []);
    });
    var qualified = [];
    var rejected = [];
    (entries || []).forEach(function (e) {
      var own = entryPlatform(e);
      var acc = entryAccountNorm(e);
      var hit = null;
      if (acc && sets[own].has(acc)) hit = own;
      else if (acc && sets[own === 'FB' ? 'IG' : 'FB'].has(acc)) hit = own === 'FB' ? 'IG' : 'FB';
      if (acc && hit) {
        qualified.push(Object.assign({}, e, {
          matchedPlatform: hit,
          entryId: buildEntryId(own, acc)
        }));
      } else {
        rejected.push(Object.assign({}, e, {
          rejectReason: acc ? '帳號沒有在留言名單找到（沒留言不算參加）' : '缺帳號名稱'
        }));
      }
    });
    return { qualified: qualified, rejected: rejected };
  }

  // 去重鍵：電話／Email／有填的發票／有填的訂單編號。空白發票或空白訂單編號不當成同一人。
  function dedupeKeysOf(e) {
    var keys = [];
    var p = normalizePhone(e.phone != null ? e.phone : e['電話']);
    var em = normalizeEmail(e.email != null ? e.email : e['Email']);
    var iv = normalizeInvoice(e.invoice != null ? e.invoice : e['發票號碼']);
    var oid = normalizeOrderId(e.orderId != null ? e.orderId : e['訂單編號']);
    if (p) keys.push('電話:' + p);
    if (em) keys.push('Email:' + em);
    if (iv) keys.push('發票:' + iv);
    if (oid) keys.push('訂單:' + oid);
    return keys;
  }

  /**
   * 依序合併多來源（通常 [{source:'線下',entries}, {source:'線上',entries}]），
   * 先出現的優先保留，後面撞到的丟進 dropped。回傳 { merged, dropped }。
   */
  function dedupeMerge(sourceLists) {
    var seen = {};   // dedupeKey → merged 索引
    var merged = [];
    var dropped = [];
    (sourceLists || []).forEach(function (list) {
      (list.entries || []).forEach(function (e) {
        var keys = dedupeKeysOf(e);
        var hit = null;
        for (var i = 0; i < keys.length; i++) {
          if (seen[keys[i]] !== undefined) { hit = keys[i]; break; }
        }
        if (hit !== null) {
          dropped.push(Object.assign({}, e, {
            source: list.source,
            dedupeNote: '與名單第 ' + (seen[hit] + 1) + ' 筆重複（' + hit + '）'
          }));
        } else {
          var idx = merged.length;
          keys.forEach(function (k) { seen[k] = idx; });
          merged.push(Object.assign({}, e, { source: list.source }));
        }
      });
    });
    return { merged: merged, dropped: dropped };
  }

  // ---- 抽籤（verify.py 風格：SHA-256(seed|id) 小到大排序）---------------
  function sha256Hex(s) {
    if (typeof require === 'function') {
      return require('crypto').createHash('sha256').update(s, 'utf8').digest('hex');
    }
    throw new Error('sha256Hex 僅支援 Node；瀏覽器請改用 crypto.subtle。');
  }
  function rankDraw(ids, seed) {
    var sorted = ids.slice().sort();
    var listHash = sha256Hex(sorted.join('\n'));
    var ranked = sorted.map(function (id) {
      return { id: id, hash: sha256Hex(str(seed) + '|' + id) };
    });
    ranked.sort(function (a, b) {
      if (a.hash !== b.hash) return a.hash < b.hash ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return { listHash: listHash, ranked: ranked };
  }

  return {
    INVOICE_RE: INVOICE_RE,
    ORDER_ID_RE: ORDER_ID_RE,
    isValidInvoice: isValidInvoice,
    normalizeInvoice: normalizeInvoice,
    invoiceAlreadyUsed: invoiceAlreadyUsed,
    isValidOrderId: isValidOrderId,
    normalizeOrderId: normalizeOrderId,
    canonicalOrderChannel: canonicalOrderChannel,
    resolveChannel: resolveChannel,
    isValidEmail: isValidEmail,
    normalizeEmail: normalizeEmail,
    isValidPhone: isValidPhone,
    normalizePhone: normalizePhone,
    normalizeAccount: normalizeAccount,
    validateForm: validateForm,
    parseQueryString: parseQueryString,
    resolveConfig: resolveConfig,
    pickPostUrl: pickPostUrl,
    parseCsv: parseCsv,
    toCsv: toCsv,
    csvEscape: csvEscape,
    matchOfflineWithComments: matchOfflineWithComments,
    dedupeKeysOf: dedupeKeysOf,
    dedupeMerge: dedupeMerge,
    buildEntryId: buildEntryId,
    sha256Hex: sha256Hex,
    rankDraw: rankDraw
  };
});
