/**
 * 盧琴樹 雙11 線下抽獎 — 驗證、正規化、URL 解析、比對合併（純函式，無 DOM 依賴）
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
  var INVOICE_RE = /^[A-Za-z]{2}-?[0-9]{8}$/;      // 發票號碼：2 碼英文 + 8 碼數字，可含 dash
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;   // 夠用的 Email 格式
  var PHONE_RE = /^[0-9+\-\s()]{8,15}$/;           // 電話（台灣手機/市話含 +886）
  var WS_RE = /\s+/g;
  var ACCOUNT_URL_PREFIX_RE =
    /^(?:https?:\/\/)?(?:(?:www|m|mobile)\.)?(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me)\//i;

  function str(v) { return v == null ? '' : String(v); }
  function trim(v) { return str(v).trim(); }

  // ---- 發票號碼 ---------------------------------------------------------
  function isValidInvoice(v) {
    return INVOICE_RE.test(trim(v));
  }
  function normalizeInvoice(v) {
    return trim(v).toUpperCase().replace(/-/g, '');  // AB-12345678 → AB12345678
  }

  // ---- Email -------------------------------------------------------------
  function isValidEmail(v) {
    return EMAIL_RE.test(trim(v));
  }
  function normalizeEmail(v) {
    return trim(v).toLowerCase();
  }

  // ---- 電話（與試算表 Meta受眾 分頁公式同一套 886 規則）-----------------
  function isValidPhone(v) {
    return PHONE_RE.test(trim(v));
  }
  function normalizePhone(v) {
    var d = str(v).replace(/[^0-9]/g, '');
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
  function validateForm(d) {
    d = d || {};
    var errors = {};
    var name = trim(d.name);
    var email = trim(d.email);
    var phone = trim(d.phone);
    var amountRaw = trim(d.amount).replace(/,/g, '');
    var amount = Number(amountRaw);
    var platform = trim(d.platform).toUpperCase();
    var account = trim(d.account);
    var invoice = trim(d.invoice);

    if (!name) errors.name = '請填寫姓名喔';
    else if (name.length > 50) errors.name = '姓名太長了，請確認一下';

    if (!email) errors.email = '請填 Email，中獎通知會寄到這裡';
    else if (!isValidEmail(email)) errors.email = 'Email 格式好像不太對，再檢查一下';

    if (!phone) errors.phone = '請填電話，中獎才能聯絡到你';
    else if (!isValidPhone(phone)) errors.phone = '電話格式好像不太對，例：0912345678';

    if (amountRaw === '' || isNaN(amount) || !isFinite(amount)) errors.amount = '消費金額請填數字，例：1280';
    else if (amount <= 0) errors.amount = '消費金額要大於 0 喔';

    if (platform !== 'FB' && platform !== 'IG') errors.platform = '請選擇 FB 或 IG 其中一個';

    if (!account) errors.account = '請填寫你的 ' + (platform === 'FB' ? 'FB' : 'FB／IG') + ' 帳號名稱';
    else if (account.length > 100) errors.account = '帳號名稱太長了，請確認一下';

    if (!invoice) errors.invoice = '請填發票號碼，例：AB12345678';
    else if (!isValidInvoice(invoice)) errors.invoice = '發票號碼格式是 2 碼英文＋8 碼數字，例：AB12345678';

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
    var map = { fb: 'FB_POST_URL', ig: 'IG_POST_URL', store: 'STORE_NAME', endpoint: 'GAS_ENDPOINT', fbpage: 'FB_PAGE_URL', igpage: 'IG_PAGE_URL' };
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

  // 去重鍵：電話(正規化)／Email(小寫)／發票號碼，任一撞到即視為同一人
  function dedupeKeysOf(e) {
    var keys = [];
    var p = normalizePhone(e.phone != null ? e.phone : e['電話']);
    var em = normalizeEmail(e.email != null ? e.email : e['Email']);
    var iv = normalizeInvoice(e.invoice != null ? e.invoice : e['發票號碼']);
    if (p) keys.push('電話:' + p);
    if (em) keys.push('Email:' + em);
    if (iv) keys.push('發票:' + iv);
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
    isValidInvoice: isValidInvoice,
    normalizeInvoice: normalizeInvoice,
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
